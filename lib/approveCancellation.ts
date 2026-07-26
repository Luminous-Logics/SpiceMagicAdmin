/**
 * Shared cancellation-approval pipeline.
 *
 * Issues the real Clover refund for a *pending* cancellation request, then (only
 * on success) applies the order mutations in a single save, restores inventory
 * best-effort, and writes an audit log. Idempotent: a request that is not
 * pending is treated as already processed.
 *
 * Used by BOTH the customer-facing approve route
 * (`/api/admin/cancellations/.../approve`) and the admin-initiated direct
 * cancellation route (`/api/orders/[orderId]/cancel`) so the refund logic lives
 * in exactly one place.
 */
import mongoose from 'mongoose';
import type { ICancellationRequest, IOrder, IOrderItem } from '@/models/Order';
import SystemLog from '@/models/SystemLog';
import { restoreItemStock, getOrderLineItemIdsByProduct } from '@/lib/clover';
import {
  issueCloverRefund,
  issueCloverFullReturn,
  isLineItemsNotAllowed,
  type CloverReturnItem,
} from '@/lib/cloverEcomm';
import { shapeRequest, shortOrderId } from '@/lib/cancellationsServer';

type OrderDoc = mongoose.HydratedDocument<IOrder>;
type CancellationSubdoc = ICancellationRequest & mongoose.Types.Subdocument;

export interface CancellationApprovalResult {
  /** HTTP status the caller should surface. */
  status: number;
  /** JSON body the caller should return. */
  body: Record<string, unknown>;
  /** True when a Clover refund actually succeeded and the order was updated. */
  refunded: boolean;
  /** Cents refunded (0 when no refund was issued). */
  refundAmount: number;
  cloverRefundId?: string;
}

/**
 * Process approval of a single (already-persisted-in-memory) cancellation
 * request sub-document. The caller is responsible for auth, loading the order,
 * and locating the request sub-document.
 */
export async function processCancellationApproval(
  order: OrderDoc,
  request: CancellationSubdoc,
  adminId: string,
  /**
   * Idempotency key sent to Clover so a retry (timeout / DB save failure) never
   * double-refunds. Defaults to the (persisted, stable) request `_id`. The
   * admin direct-cancel flow passes a deterministic order-based key because its
   * request sub-document is regenerated on every attempt.
   */
  idempotencyKey?: string,
): Promise<CancellationApprovalResult> {
  const requestId = request._id.toString();
  const refundIdempotencyKey = idempotencyKey || requestId;

  // ---- Idempotency: only a pending request can be approved. ----------------
  if (request.status !== 'pending') {
    return {
      status: 200,
      body: {
        message: `Request already ${request.status}`,
        alreadyProcessed: true,
        request: shapeRequest(request),
      },
      refunded: false,
      refundAmount: 0,
    };
  }

  if (!order.cloverOrderId) {
    return {
      status: 409,
      body: { error: 'Order has no cloverOrderId — cannot issue a refund.' },
      refunded: false,
      refundAmount: 0,
    };
  }

  const totalUnits = request.items.reduce((sum, it) => sum + it.quantity, 0);
  if (totalUnits === 0) {
    return {
      status: 400,
      body: { error: 'Cancellation request has no items to refund.' },
      refunded: false,
      refundAmount: 0,
    };
  }

  // ---- Resolve real Clover line-item ids ----------------------------------
  // Itemized returns require actual ORDER line-item ids (not inventory/product
  // ids). If the request is missing any, recover them from the live Clover
  // order, skipping ids already consumed by other (non-rejected) requests.
  const needsRecovery = request.items.some(
    (it) => !it.lineItemIds || it.lineItemIds.length < it.quantity,
  );
  const fetchedByProduct = needsRecovery
    ? await getOrderLineItemIdsByProduct(order.cloverOrderId)
    : {};

  const consumedIds = new Set<string>();
  for (const other of order.cancellationRequests as unknown as CancellationSubdoc[]) {
    if (other._id.toString() === requestId) continue;
    if (other.status === 'rejected') continue;
    for (const it of other.items) (it.lineItemIds || []).forEach((l) => consumedIds.add(l));
  }

  const resolvedIdsByItem: string[][] = request.items.map((it) => {
    const ids = (it.lineItemIds || []).filter(Boolean);
    if (ids.length < it.quantity) {
      const pool = (fetchedByProduct[it.productId] || []).filter(
        (l) => !consumedIds.has(l) && !ids.includes(l),
      );
      for (const l of pool) {
        if (ids.length >= it.quantity) break;
        ids.push(l);
      }
    }
    ids.forEach((l) => consumedIds.add(l));
    return ids.slice(0, it.quantity);
  });

  // ---- Build the itemized returns payload (never trust client amounts) -----
  const returnItems: CloverReturnItem[] = [];
  request.items.forEach((item, i) => {
    for (const lineItemId of resolvedIdsByItem[i]) {
      returnItems.push({
        parent: lineItemId,
        amount: Math.round(item.unitRefundAmount),
        quantity: 1,
        type: 'sku',
        description: item.name,
      });
    }
  });
  const haveAllLineItems = returnItems.length === totalUnits;

  // ---- Determine whether a full (bodiless) return is safe ------------------
  // Only when this request clears ALL remaining units of every order item AND
  // no refund has been issued yet — otherwise a full return could over-refund.
  const projectedFullRefund = order.items.every((oi: IOrderItem) => {
    const reqQty = request.items
      .filter((ri) => ri.productId === oi.productId)
      .reduce((s, ri) => s + ri.quantity, 0);
    return (oi.cancelledQuantity ?? 0) + reqQty >= (oi.quantity ?? 0);
  });
  const canFullReturn = projectedFullRefund && (order.totalRefunded ?? 0) === 0;

  // ---- Issue the Clover refund. Do NOT mutate the order if this fails. -----
  let refund;
  try {
    if (haveAllLineItems) {
      refund = await issueCloverRefund(order.cloverOrderId, returnItems, refundIdempotencyKey);
      // Some orders are paid as a lump sum (an explicit `amount` on the Clover
      // "pay for an order" call), so their payment isn't allocated to line items
      // and Clover rejects itemized returns entirely.
      if (!refund.ok && isLineItemsNotAllowed(refund)) {
        if (canFullReturn) {
          console.warn('[approve] itemized return rejected; falling back to full return');
          refund = await issueCloverFullReturn(order.cloverOrderId, refundIdempotencyKey);
        } else {
          return {
            status: 409,
            body: {
              error:
                'This order was paid as a non-itemized ecommerce payment, so Clover will not allow a PARTIAL refund of individual items. You can approve a full-order cancellation, or process this partial refund from the Clover Dashboard. To enable API partial refunds, the storefront must itemize the payment (see STOREFRONT_REFUND_FIX_PROMPT.md).',
            },
            refunded: false,
            refundAmount: 0,
          };
        }
      }
    } else if (canFullReturn) {
      // Missing line-item ids but the whole order is being refunded first-time.
      console.warn('[approve] line-item ids unavailable; issuing full return');
      refund = await issueCloverFullReturn(order.cloverOrderId, refundIdempotencyKey);
    } else {
      return {
        status: 409,
        body: {
          error:
            'Could not resolve Clover line items for this partial refund. This order was likely paid without itemized line items, so a partial API refund is not possible. Refund the full order, or process this refund in the Clover Dashboard.',
        },
        refunded: false,
        refundAmount: 0,
      };
    }
  } catch (err) {
    return {
      status: 500,
      body: { error: `Refund could not be issued: ${(err as Error).message}` },
      refunded: false,
      refundAmount: 0,
    };
  }

  if (!refund.ok) {
    await SystemLog.create({
      action: 'CANCELLATION_REFUND_FAILED',
      actorId: adminId,
      orderId: order._id.toString(),
      requestId,
      meta: { cloverOrderId: order.cloverOrderId, error: refund.error, status: refund.status },
    }).catch(() => undefined);

    return {
      status: 502,
      body: {
        error: refund.error || 'Clover refund failed',
        cloverStatus: refund.status,
        details: refund.raw,
      },
      refunded: false,
      refundAmount: 0,
    };
  }

  // ---- Refund succeeded: apply all order mutations in a single save. -------
  const now = new Date();
  request.status = 'approved';
  request.processedAt = now;
  request.processedBy = adminId;
  request.cloverRefundId = refund.id;

  // Persist any line-item ids we recovered so history/idempotency stays accurate.
  request.items.forEach((it, i) => {
    if ((!it.lineItemIds || it.lineItemIds.length === 0) && resolvedIdsByItem[i].length > 0) {
      it.lineItemIds = resolvedIdsByItem[i];
    }
  });

  // Apply per-item refunded quantities/amounts against the matching order item.
  for (const reqItem of request.items) {
    const orderItem = order.items.find((oi: IOrderItem) => oi.productId === reqItem.productId);
    if (orderItem) {
      orderItem.cancelledQuantity = (orderItem.cancelledQuantity ?? 0) + reqItem.quantity;
      orderItem.refundedAmount = (orderItem.refundedAmount ?? 0) + reqItem.refundAmount;
    }
  }

  order.totalRefunded = (order.totalRefunded ?? 0) + request.refundAmount;

  // Recompute payment status from per-item cancelled quantities.
  const allFullyRefunded = order.items.every(
    (oi: IOrderItem) => (oi.cancelledQuantity ?? 0) >= (oi.quantity ?? 0),
  );
  const anyRefunded = order.items.some((oi: IOrderItem) => (oi.cancelledQuantity ?? 0) > 0);
  if (allFullyRefunded) {
    order.status = 'refunded';
  } else if (anyRefunded) {
    order.status = 'partially_refunded';
  }

  // The order document is written by the storefront (which uses a different
  // Order schema — e.g. `totalAmount` instead of `subtotal`/`total`). Validate
  // ONLY the fields we changed so unrelated required fields don't block the save
  // AFTER the Clover refund has already succeeded.
  try {
    await order.save({ validateModifiedOnly: true });
  } catch (saveErr) {
    // The refund already went through on Clover but we couldn't persist it.
    // Record everything needed to reconcile so no money is silently lost.
    console.error('[approve] DB save failed AFTER successful refund', saveErr);
    await SystemLog.create({
      action: 'CANCELLATION_APPROVED_SAVE_FAILED',
      actorId: adminId,
      orderId: order._id.toString(),
      requestId,
      meta: {
        cloverOrderId: order.cloverOrderId,
        cloverRefundId: refund.id,
        refundAmount: request.refundAmount,
        error: (saveErr as Error).message,
      },
    }).catch(() => undefined);

    return {
      status: 500,
      body: {
        error:
          'The Clover refund succeeded but the order could not be updated in the database. This has been logged for reconciliation — do NOT re-approve this request or it may refund again.',
        cloverRefundId: refund.id,
        details: (saveErr as Error).message,
      },
      refunded: false,
      refundAmount: 0,
      cloverRefundId: refund.id,
    };
  }

  // ---- Restore inventory (best-effort, non-fatal). -------------------------
  const inventoryResults: Array<{ productId: string; units: number; restored: boolean; reason?: string }> = [];
  for (const reqItem of request.items) {
    const result = await restoreItemStock(reqItem.productId, reqItem.quantity);
    inventoryResults.push({
      productId: reqItem.productId,
      units: reqItem.quantity,
      restored: result.restored,
      reason: result.reason,
    });
  }

  // ---- Audit log. ----------------------------------------------------------
  await SystemLog.create({
    action: 'CANCELLATION_APPROVED',
    actorId: adminId,
    orderId: order._id.toString(),
    requestId,
    meta: {
      shortId: shortOrderId(order._id),
      cloverOrderId: order.cloverOrderId,
      cloverRefundId: refund.id,
      refundAmount: request.refundAmount,
      orderStatus: order.status,
      inventory: inventoryResults,
    },
  }).catch(() => undefined);

  return {
    status: 200,
    body: {
      message: 'Refund issued and cancellation approved.',
      request: shapeRequest(request),
      order: {
        orderId: order._id.toString(),
        status: order.status,
        totalRefunded: order.totalRefunded,
      },
      cloverRefundId: refund.id,
      inventory: inventoryResults,
    },
    refunded: true,
    refundAmount: request.refundAmount,
    cloverRefundId: refund.id,
  };
}
