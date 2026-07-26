/**
 * Server-only helpers for the Orders API: translating query-string filters into
 * a MongoDB filter and enriching raw order documents with customer info.
 *
 * Shared by GET /api/orders and GET /api/orders/export so the filtering and
 * shaping logic stays in one place.
 */
import mongoose, { type FilterQuery } from 'mongoose';
import User from '@/models/User';
import type { IOrder } from '@/models/Order';
import {
  getTabStatuses,
  normalizeDeliveryMethod,
  normalizeOrderStatus,
  normalizePaymentStatus,
  ORDER_STATUSES,
  PAYMENT_STATUSES,
  DELIVERY_METHODS,
  type OrderStatus,
  type OrderTab,
} from '@/lib/orders';

/** Lean order document as returned by `.lean()` (plain object, not a Document). */
type LeanOrder = IOrder & { _id: mongoose.Types.ObjectId };

export interface EnrichedOrder {
  _id: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  itemsCount: number;
  items: IOrder['items'];
  subtotal: number;
  tax: number;
  deliveryFee: number;
  couponCode: string;
  couponDiscount: number;
  total: number;
  paymentStatus: string;
  orderStatus: OrderStatus;
  deliveryMethod: string;
  deliveryAddress: Record<string, unknown> | null;
  stripePaymentIntentId: string;
  statusHistory: IOrder['statusHistory'];
  cancelReason: string;
  completedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Builds an orderStatus condition that also matches legacy documents that were
 * created before the field existed (treated as "pending").
 */
function buildStatusCondition(allowed: OrderStatus[]): FilterQuery<IOrder> {
  if (allowed.includes('pending')) {
    return {
      $or: [
        { orderStatus: { $in: allowed } },
        { orderStatus: { $exists: false } },
        { orderStatus: null },
      ],
    };
  }
  return { orderStatus: { $in: allowed } };
}

/**
 * Translate the request's query params into a MongoDB filter. Async because a
 * customer-name/email search first resolves matching user ids.
 */
export async function buildOrderQuery(
  params: URLSearchParams,
): Promise<FilterQuery<IOrder>> {
  const and: FilterQuery<IOrder>[] = [];

  // ----- Tab + explicit status filter -----
  const tab = (params.get('tab') || 'history') as OrderTab;
  const tabStatuses = getTabStatuses(tab); // null => all
  const explicitStatus = params.get('status');

  let allowed: OrderStatus[] | null = tabStatuses;
  if (explicitStatus && ORDER_STATUSES.includes(explicitStatus as OrderStatus)) {
    const asStatus = explicitStatus as OrderStatus;
    // Intersect the explicit filter with the tab's allowed set.
    allowed = tabStatuses ? tabStatuses.filter((s) => s === asStatus) : [asStatus];
  }
  if (allowed) and.push(buildStatusCondition(allowed));

  // ----- Search: order id / customer name / email / phone -----
  const search = (params.get('search') || '').trim();
  if (search) {
    const rx = { $regex: escapeRegex(search), $options: 'i' };
    const or: FilterQuery<IOrder>[] = [
      { customerName: rx },
      { customerEmail: rx },
      { customerPhone: rx },
      { 'deliveryAddress.phone': rx } as FilterQuery<IOrder>,
      { 'deliveryAddress.name': rx } as FilterQuery<IOrder>,
    ];
    if (mongoose.isValidObjectId(search)) {
      or.push({ _id: new mongoose.Types.ObjectId(search) } as FilterQuery<IOrder>);
    }
    // Resolve users whose name/email/phone match, then match their orders.
    const users = await User.find({ $or: [{ name: rx }, { email: rx }] })
      .select('_id')
      .lean();
    const userIds = users.map((u) => (u._id as mongoose.Types.ObjectId).toString());
    if (userIds.length) or.push({ userId: { $in: userIds } });
    and.push({ $or: or });
  }

  // ----- Payment status -----
  const paymentStatus = params.get('paymentStatus');
  if (paymentStatus && PAYMENT_STATUSES.includes(paymentStatus as never)) {
    and.push({ status: paymentStatus } as FilterQuery<IOrder>);
  }

  // ----- Delivery method (include legacy docs missing the field for pickup) --
  const deliveryMethod = params.get('deliveryMethod');
  if (deliveryMethod && DELIVERY_METHODS.includes(deliveryMethod as never)) {
    if (deliveryMethod === 'pickup') {
      and.push({
        $or: [
          { deliveryMethod: 'pickup' },
          { deliveryMethod: { $exists: false } },
          { deliveryMethod: null },
        ],
      });
    } else {
      and.push({ deliveryMethod } as FilterQuery<IOrder>);
    }
  }

  // ----- Amount range (cents) -----
  const minAmount = params.get('minAmount');
  const maxAmount = params.get('maxAmount');
  if (minAmount || maxAmount) {
    const total: Record<string, number> = {};
    if (minAmount) total.$gte = parseInt(minAmount, 10);
    if (maxAmount) total.$lte = parseInt(maxAmount, 10);
    and.push({ total } as FilterQuery<IOrder>);
  }

  // ----- Date range (createdAt) -----
  const dateFrom = params.get('dateFrom');
  const dateTo = params.get('dateTo');
  if (dateFrom || dateTo) {
    const createdAt: Record<string, Date> = {};
    if (dateFrom) createdAt.$gte = new Date(dateFrom);
    if (dateTo) {
      // Include the entire end day.
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      createdAt.$lte = end;
    }
    and.push({ createdAt } as FilterQuery<IOrder>);
  }

  return and.length ? { $and: and } : {};
}

function pickCustomer(
  order: LeanOrder,
  user?: { name?: string; email?: string },
): { customerName: string; customerEmail: string; customerPhone: string } {
  const addr = (order.deliveryAddress || {}) as Record<string, unknown>;
  const addrName = typeof addr.name === 'string' ? addr.name : '';
  const addrPhone = typeof addr.phone === 'string' ? addr.phone : '';
  return {
    customerName: order.customerName || user?.name || addrName || 'Guest',
    customerEmail: order.customerEmail || user?.email || '',
    customerPhone: order.customerPhone || addrPhone || '',
  };
}

/**
 * Attach resolved customer info and normalize legacy/missing enum fields for a
 * batch of lean order documents. Performs a single User lookup for the batch.
 */
export async function enrichOrders(orders: LeanOrder[]): Promise<EnrichedOrder[]> {
  const userIds = Array.from(
    new Set(orders.map((o) => o.userId).filter((id) => mongoose.isValidObjectId(id))),
  );
  type LeanUser = { _id: mongoose.Types.ObjectId; name?: string; email?: string };
  const users = userIds.length
    ? await User.find({ _id: { $in: userIds } }).select('name email').lean<LeanUser[]>()
    : [];
  const userMap = new Map<string, LeanUser>(
    users.map((u) => [u._id.toString(), u]),
  );

  return orders.map((o) => {
    const customer = pickCustomer(o, userMap.get(o.userId));

    // Storefront orders store only `totalAmount` (cents) — not the admin's
    // subtotal/tax/deliveryFee/total breakdown. Reconstruct what we can from the
    // line items and the stored grand total so the UI never shows $0.
    const items = Array.isArray(o.items) ? o.items : [];
    const computedSubtotal = items.reduce(
      (sum, it) => sum + (it.finalPrice || 0) * (it.quantity || 0),
      0,
    );
    const computedTax = items.reduce(
      (sum, it) => sum + (it.taxPerUnit || 0) * (it.quantity || 0),
      0,
    );
    const couponDiscount = o.couponDiscount ?? 0;
    const subtotal = o.subtotal || computedSubtotal;
    const tax = o.tax || computedTax;
    const storedDeliveryFee = o.deliveryFee ?? 0;
    const total = o.total || o.totalAmount || Math.max(0, subtotal - couponDiscount + tax + storedDeliveryFee);
    // If a grand total is known but no explicit delivery fee was stored, treat
    // the unexplained remainder as the delivery fee.
    const deliveryFee = storedDeliveryFee || Math.max(0, total - subtotal + couponDiscount - tax);

    return {
      _id: o._id.toString(),
      ...customer,
      itemsCount: items.reduce((sum, it) => sum + (it.quantity || 0), 0),
      items,
      subtotal,
      tax,
      deliveryFee,
      couponCode: o.couponCode || '',
      couponDiscount,
      total,
      paymentStatus: normalizePaymentStatus(o.status),
      orderStatus: normalizeOrderStatus(o.orderStatus),
      deliveryMethod: normalizeDeliveryMethod(o.deliveryMethod),
      deliveryAddress: (o.deliveryAddress as Record<string, unknown>) || null,
      stripePaymentIntentId: o.stripePaymentIntentId || '',
      statusHistory: o.statusHistory || [],
      cancelReason: o.cancelReason || '',
      completedAt: o.completedAt ? new Date(o.completedAt).toISOString() : null,
      cancelledAt: o.cancelledAt ? new Date(o.cancelledAt).toISOString() : null,
      createdAt: o.createdAt ? new Date(o.createdAt).toISOString() : '',
      updatedAt: o.updatedAt ? new Date(o.updatedAt).toISOString() : '',
    };
  });
}
