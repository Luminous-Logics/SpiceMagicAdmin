/**
 * Server-only helpers for the cancellation-approval API: shaping raw order
 * documents (and their `cancellationRequests`) into a UI-friendly payload and
 * resolving customer info. Kept out of the client bundle (imports mongoose).
 */
import mongoose from 'mongoose';
import User from '@/models/User';
import type { IOrder, ICancellationRequest } from '@/models/Order';
import { normalizeOrderStatus, normalizePaymentStatus } from '@/lib/orders';

export type LeanOrder = IOrder & { _id: mongoose.Types.ObjectId };

export interface CancellationRequestItemView {
  productId: string;
  name: string;
  quantity: number;
  lineItemIds: string[];
  unitRefundAmount: number;
  refundAmount: number;
}

export interface CancellationRequestView {
  requestId: string;
  status: 'pending' | 'approved' | 'rejected';
  reason: string;
  refundAmount: number;
  requestedAt: string | null;
  processedAt: string | null;
  processedBy: string;
  adminNote: string;
  cloverRefundId: string;
  items: CancellationRequestItemView[];
}

export interface CancellationOrderView {
  orderId: string;
  shortId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  orderTotal: number;
  totalRefunded: number;
  paymentStatus: string;
  orderStatus: string;
  cloverOrderId: string;
  createdAt: string | null;
  requests: CancellationRequestView[];
}

/** Short, human-friendly order id (last 6 chars, uppercased). */
export function shortOrderId(id: mongoose.Types.ObjectId | string): string {
  return id.toString().slice(-6).toUpperCase();
}

function toIso(value: unknown): string | null {
  if (!value) return null;
  const d = new Date(value as string);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function shapeRequest(req: ICancellationRequest): CancellationRequestView {
  return {
    requestId: req._id.toString(),
    status: req.status,
    reason: req.reason || '',
    refundAmount: req.refundAmount ?? 0,
    requestedAt: toIso(req.requestedAt),
    processedAt: toIso(req.processedAt),
    processedBy: req.processedBy || '',
    adminNote: req.adminNote || '',
    cloverRefundId: req.cloverRefundId || '',
    items: (req.items || []).map((it) => ({
      productId: it.productId,
      name: it.name,
      quantity: it.quantity ?? 0,
      lineItemIds: it.lineItemIds || [],
      unitRefundAmount: it.unitRefundAmount ?? 0,
      refundAmount: it.refundAmount ?? 0,
    })),
  };
}

function resolveCustomer(
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
 * Shape a batch of lean orders into cancellation views. `statusFilter` limits
 * which requests are included per order (null = all). Requests are sorted
 * newest-first by requestedAt.
 */
export async function shapeCancellationOrders(
  orders: LeanOrder[],
  statusFilter: 'pending' | 'approved' | 'rejected' | null,
): Promise<CancellationOrderView[]> {
  const userIds = Array.from(
    new Set(orders.map((o) => o.userId).filter((id) => mongoose.isValidObjectId(id))),
  );
  type LeanUser = { _id: mongoose.Types.ObjectId; name?: string; email?: string };
  const users = userIds.length
    ? await User.find({ _id: { $in: userIds } }).select('name email').lean<LeanUser[]>()
    : [];
  const userMap = new Map<string, LeanUser>(users.map((u) => [u._id.toString(), u]));

  return orders.map((o) => {
    const customer = resolveCustomer(o, userMap.get(o.userId));
    const requests = (o.cancellationRequests || [])
      .filter((r) => (statusFilter ? r.status === statusFilter : true))
      .map(shapeRequest)
      .sort((a, b) => {
        const ta = a.requestedAt ? Date.parse(a.requestedAt) : 0;
        const tb = b.requestedAt ? Date.parse(b.requestedAt) : 0;
        return tb - ta;
      });

    return {
      orderId: o._id.toString(),
      shortId: shortOrderId(o._id),
      ...customer,
      orderTotal: o.total ?? 0,
      totalRefunded: o.totalRefunded ?? 0,
      paymentStatus: normalizePaymentStatus(o.status),
      orderStatus: normalizeOrderStatus(o.orderStatus),
      cloverOrderId: o.cloverOrderId || '',
      createdAt: toIso(o.createdAt),
      requests,
    };
  });
}
