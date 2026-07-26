import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import mongoose from 'mongoose';
import { authOptions } from '@/lib/auth';
import dbConnect from '@/lib/db';
import Order, {
  type ICancellationRequest,
  type IOrder,
  type IOrderItem,
} from '@/models/Order';
import SystemLog from '@/models/SystemLog';
import { enrichOrders } from '@/lib/ordersServer';
import { processCancellationApproval } from '@/lib/approveCancellation';
import { normalizeOrderStatus } from '@/lib/orders';

type CancellationSubdoc = ICancellationRequest & mongoose.Types.Subdocument;
type LeanOrder = IOrder & { _id: mongoose.Types.ObjectId };

interface RequestItem {
  productId: string;
  name: string;
  quantity: number;
  lineItemIds: string[];
  unitRefundAmount: number;
  refundAmount: number;
}

/** One `{ productId, quantity }` entry the admin chose to cancel. */
interface SelectionEntry {
  productId: string;
  quantity: number;
}

/**
 * POST /api/orders/:orderId/cancel — admin-initiated cancellation / refund.
 *
 * Used when a customer cancels by phone (no self-service request). Two modes,
 * driven by the optional `items` array in the body:
 *
 *  - FULL cancel (no `items`): refunds every remaining un-refunded unit and
 *    moves the order lifecycle to `cancelled`.
 *  - PARTIAL cancel (`items: [{ productId, quantity }]`): refunds only the
 *    selected units via Clover's itemized returns and leaves the order OPEN
 *    (payment becomes `partially_refunded`). Only possible when the order was
 *    paid with itemized line items — otherwise the shared pipeline returns a
 *    409 explaining Clover won't allow a partial refund of this order.
 *
 * Unpaid orders are always cancelled outright (no Clover call), ignoring any
 * item selection. An already-cancelled order is rejected.
 *
 * Body: { reason?: string, items?: { productId: string, quantity: number }[] }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { orderId } = await params;
  if (!mongoose.isValidObjectId(orderId)) {
    return NextResponse.json({ error: 'Invalid order id' }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  const rawItems: unknown = body.items;

  const adminId =
    (session.user as { email?: string; id?: string }).email ||
    (session.user as { id?: string }).id ||
    'admin';

  await dbConnect();

  const order = await Order.findById(orderId);
  if (!order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }

  if (normalizeOrderStatus(order.orderStatus) === 'cancelled') {
    return NextResponse.json({ error: 'Order is already cancelled.' }, { status: 409 });
  }

  // ---- Remaining (un-refunded) units per product. -------------------------
  const remainingByProduct = new Map<string, number>();
  for (const it of order.items as IOrderItem[]) {
    const remaining = Math.max(0, (it.quantity ?? 0) - (it.cancelledQuantity ?? 0));
    remainingByProduct.set(it.productId, (remainingByProduct.get(it.productId) ?? 0) + remaining);
  }
  const remainingUnits = Array.from(remainingByProduct.values()).reduce((s, n) => s + n, 0);

  // ---- Parse an optional item selection (partial cancel). -----------------
  // null => cancel everything remaining (full cancel).
  let selection: Map<string, number> | null = null;
  if (Array.isArray(rawItems) && rawItems.length > 0) {
    selection = new Map();
    for (const entry of rawItems as SelectionEntry[]) {
      const pid = String(entry?.productId ?? '');
      const qty = Math.floor(Number(entry?.quantity ?? 0));
      if (!pid || !Number.isFinite(qty) || qty <= 0) continue;
      const clamped = Math.min(qty, remainingByProduct.get(pid) ?? 0);
      if (clamped > 0) selection.set(pid, clamped);
    }
    if (selection.size === 0) {
      return NextResponse.json(
        { error: 'No valid items selected to cancel.' },
        { status: 400 },
      );
    }
  }

  const isPaid = order.status === 'paid' || order.status === 'partially_refunded';

  // ---- Build the per-item refund request from the selection. --------------
  const requestItems = (order.items as IOrderItem[])
    .map((it: IOrderItem): RequestItem | null => {
      const remaining = Math.max(0, (it.quantity ?? 0) - (it.cancelledQuantity ?? 0));
      if (remaining <= 0) return null;
      const qty = selection ? Math.min(selection.get(it.productId) ?? 0, remaining) : remaining;
      if (qty <= 0) return null;
      const unitRefundAmount = (it.finalPrice ?? 0) + (it.taxPerUnit ?? 0);
      return {
        productId: it.productId,
        name: it.name,
        quantity: qty,
        lineItemIds: [],
        unitRefundAmount,
        refundAmount: unitRefundAmount * qty,
      };
    })
    .filter((x): x is RequestItem => x !== null);

  const selectedUnits = requestItems.reduce((s, it) => s + it.quantity, 0);
  // Whole order is being cleared when every remaining unit is selected (or when
  // the order is unpaid, in which case there is nothing partial to refund).
  const cancelWholeOrder = !isPaid || selectedUnits >= remainingUnits;

  let refunded = false;
  let refundAmount = 0;
  let cloverRefundId: string | undefined;

  if (isPaid && selectedUnits > 0) {
    if (!order.cloverOrderId) {
      return NextResponse.json(
        { error: 'Order has no Clover order id — cannot issue a refund.' },
        { status: 409 },
      );
    }

    const totalRefund = requestItems.reduce((sum, it) => sum + it.refundAmount, 0);

    const requests =
      order.cancellationRequests as unknown as mongoose.Types.DocumentArray<CancellationSubdoc>;
    requests.push({
      status: 'pending',
      reason:
        reason ||
        (cancelWholeOrder
          ? 'Cancelled by admin (direct cancellation)'
          : 'Item(s) cancelled by admin'),
      refundAmount: totalRefund,
      requestedAt: new Date(),
      processedBy: adminId,
      items: requestItems,
    } as unknown as CancellationSubdoc);
    const request = requests[requests.length - 1];

    // Deterministic idempotency key: stable across retries of THIS action (so a
    // timed-out refund de-dupes instead of double-refunding) but distinct from
    // later refunds because it folds in the current refunded state + selection.
    const refundedBefore = order.totalRefunded ?? 0;
    const signature = requestItems
      .map((it) => `${it.productId}:${it.quantity}`)
      .sort()
      .join(',');
    const idempotencyKey = `admin-cancel-${order._id.toString()}-${refundedBefore}-${signature}`;

    const result = await processCancellationApproval(order, request, adminId, idempotencyKey);
    if (result.status >= 400) {
      // Refund failed — nothing was persisted; surface the error unchanged.
      return NextResponse.json(result.body, { status: result.status });
    }
    refunded = result.refunded;
    refundAmount = result.refundAmount;
    cloverRefundId = result.cloverRefundId;
  }

  // ---- Lifecycle: only flip to cancelled for a whole-order cancellation. ---
  // A partial refund leaves the order OPEN (the remaining items still ship). The
  // refund itself was already persisted by the approval pipeline above.
  if (cancelWholeOrder) {
    const now = new Date();
    const current = normalizeOrderStatus(order.orderStatus);
    order.statusHistory.push({
      from: current,
      to: 'cancelled',
      changedByEmail: session.user?.email || '',
      changedByName: session.user?.name || '',
      changedAt: now,
      note: reason,
    });
    order.orderStatus = 'cancelled';
    order.cancelledAt = now;
    if (reason) order.cancelReason = reason;

    try {
      await order.save({ validateModifiedOnly: true });
    } catch (saveErr) {
      // If a refund already succeeded, the payment side is persisted; only the
      // lifecycle flip failed. Log it so the order can be reconciled.
      console.error('[cancel] lifecycle save failed', saveErr);
      await SystemLog.create({
        action: 'ADMIN_CANCEL_LIFECYCLE_SAVE_FAILED',
        actorId: adminId,
        orderId: order._id.toString(),
        meta: { refunded, cloverRefundId, error: (saveErr as Error).message },
      }).catch(() => undefined);

      return NextResponse.json(
        {
          error: refunded
            ? 'The refund succeeded but the order status could not be updated. This has been logged for reconciliation.'
            : 'The order could not be cancelled.',
          cloverRefundId,
          details: (saveErr as Error).message,
        },
        { status: 500 },
      );
    }
  }

  await SystemLog.create({
    action: cancelWholeOrder ? 'ADMIN_ORDER_CANCELLED' : 'ADMIN_ITEMS_CANCELLED',
    actorId: adminId,
    orderId: order._id.toString(),
    meta: {
      refunded,
      refundAmount,
      cloverRefundId,
      reason,
      items: requestItems.map((it) => ({ productId: it.productId, quantity: it.quantity })),
    },
  }).catch(() => undefined);

  const raw = order.toObject() as LeanOrder;
  const [enriched] = await enrichOrders([raw]);

  const message = cancelWholeOrder
    ? refunded
      ? 'Order cancelled and customer refunded.'
      : 'Order cancelled.'
    : `Refunded ${requestItems.reduce((s, it) => s + it.quantity, 0)} item(s).`;

  return NextResponse.json({
    order: enriched,
    refunded,
    refundAmount,
    cloverRefundId,
    partial: !cancelWholeOrder,
    message,
  });
}
