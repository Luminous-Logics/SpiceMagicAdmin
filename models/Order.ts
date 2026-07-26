import mongoose, { Document, Schema } from 'mongoose';
import {
  ORDER_STATUSES,
  PAYMENT_STATUSES,
  DELIVERY_METHODS,
} from '@/lib/orders';

/** A single modifier applied to an ordered item (e.g. "Extra spicy", "+ Naan"). */
export interface IOrderItemModifier {
  name: string;
  price: number;
}

export interface IOrderItem {
  productId: string;
  name: string;
  price: number;
  discount: number;
  finalPrice: number;
  quantity: number;
  imageUrl: string;
  modifiers?: IOrderItemModifier[];
  /** Per-unit tax in cents (used to compute refund amounts). */
  taxPerUnit?: number;
  /** Clover ORDER line-item ids, one per purchased unit. */
  cloverLineItemIds?: string[];
  /** Units already refunded for this item (default 0). */
  cancelledQuantity?: number;
  /** Cents already refunded for this item (default 0). */
  refundedAmount?: number;
}

/**
 * A single item selected within a customer cancellation request. Amounts are
 * computed by the storefront at request time and MUST be trusted as stored —
 * never recomputed from client input on approval.
 */
export interface ICancellationRequestItem {
  productId: string;
  name: string;
  /** Units to cancel in this request. */
  quantity: number;
  /** Clover line-item ids selected for these units. */
  lineItemIds: string[];
  /** Cents per unit (finalPrice + taxPerUnit). */
  unitRefundAmount: number;
  /** unitRefundAmount * quantity. */
  refundAmount: number;
}

/**
 * A customer-submitted cancellation request appended by the storefront. The
 * admin reviews each one and approves (issuing a real Clover refund) or rejects
 * it. The sub-document `_id` is the handle used by the approve/reject routes.
 */
export interface ICancellationRequest {
  _id: mongoose.Types.ObjectId;
  status: 'pending' | 'approved' | 'rejected';
  reason?: string;
  /** Total cents for this request. */
  refundAmount: number;
  requestedAt: Date;
  processedAt?: Date;
  /** Admin id/email that approved or rejected the request. */
  processedBy?: string;
  /** Rejection reason / note. */
  adminNote?: string;
  /** Clover return id, set on approval. */
  cloverRefundId?: string;
  items: ICancellationRequestItem[];
}

/**
 * Immutable audit-log entry. One is appended every time the order status
 * changes; entries are never edited or removed.
 */
export interface IOrderStatusHistory {
  from: string;
  to: string;
  changedByEmail: string;
  changedByName: string;
  changedAt: Date;
  note?: string;
}

export interface IOrder extends Document {
  userId: string;
  items: IOrderItem[];
  subtotal: number;
  tax: number;
  deliveryFee: number;
  couponCode: string;
  couponDiscount: number;
  total: number;
  /**
   * Storefront-written grand total in cents. The storefront schema stores only
   * `totalAmount` (not the admin's `subtotal`/`tax`/`deliveryFee`/`total`
   * breakdown), so read routes fall back to this when the breakdown is absent.
   */
  totalAmount?: number;
  stripePaymentIntentId: string;
  deliveryAddress: Record<string, unknown>;
  deliveryMethod: 'pickup' | 'delivery';
  /** Payment status (also carries refund states after cancellation approval). */
  status:
    | 'pending'
    | 'paid'
    | 'failed'
    | 'partially_refunded'
    | 'refunded';
  // ── Clover Ecommerce refund fields (shared with the storefront) ───────────
  /** Clover order id — target for the returns (refund) API. */
  cloverOrderId?: string;
  /** Clover charge id. */
  paymentId?: string;
  /** Running sum of refunds in cents. */
  totalRefunded?: number;
  /** Customer cancellation requests, appended by the storefront. */
  cancellationRequests: ICancellationRequest[];
  /** Fulfillment lifecycle status. */
  orderStatus:
    | 'pending'
    | 'confirmed'
    | 'preparing'
    | 'ready'
    | 'completed'
    | 'cancelled';
  statusHistory: IOrderStatusHistory[];
  cancelReason: string;
  completedAt: Date | null;
  cancelledAt: Date | null;
  // Denormalized customer snapshot (populated on create going forward; older
  // orders fall back to a User lookup / deliveryAddress at read time).
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  createdAt: Date;
  updatedAt: Date;
}

const StatusHistorySchema = new Schema<IOrderStatusHistory>(
  {
    from: { type: String, default: '' },
    to: { type: String, required: true },
    changedByEmail: { type: String, default: '' },
    changedByName: { type: String, default: '' },
    changedAt: { type: Date, default: Date.now },
    note: { type: String, default: '' },
  },
  { _id: false },
);

const CancellationRequestItemSchema = new Schema<ICancellationRequestItem>(
  {
    productId: String,
    name: String,
    quantity: Number,
    lineItemIds: { type: [String], default: [] },
    unitRefundAmount: Number,
    refundAmount: Number,
  },
  { _id: false },
);

const CancellationRequestSchema = new Schema<ICancellationRequest>(
  {
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },
    reason: { type: String, default: '' },
    refundAmount: { type: Number, default: 0 },
    requestedAt: { type: Date, default: Date.now },
    processedAt: { type: Date, default: null },
    processedBy: { type: String, default: '' },
    adminNote: { type: String, default: '' },
    cloverRefundId: { type: String, default: '' },
    items: { type: [CancellationRequestItemSchema], default: [] },
  },
  // Keep the sub-document `_id` — it is the handle the approve/reject routes use.
  { _id: true },
);

const OrderSchema = new Schema<IOrder>(
  {
    userId: { type: String, required: true },
    items: [
      {
        productId: String,
        name: String,
        price: Number,
        discount: Number,
        finalPrice: Number,
        quantity: Number,
        imageUrl: String,
        modifiers: [
          {
            name: String,
            price: Number,
            _id: false,
          },
        ],
        taxPerUnit: { type: Number, default: 0 },
        cloverLineItemIds: { type: [String], default: [] },
        cancelledQuantity: { type: Number, default: 0 },
        refundedAmount: { type: Number, default: 0 },
      },
    ],
    subtotal: { type: Number, required: true },
    tax: { type: Number, default: 0 },
    deliveryFee: { type: Number, default: 0 },
    couponCode: { type: String, default: '' },
    couponDiscount: { type: Number, default: 0 },
    total: { type: Number, required: true },
    totalAmount: { type: Number },
    stripePaymentIntentId: { type: String, default: '' },
    cloverOrderId: { type: String, default: '' },
    paymentId: { type: String, default: '' },
    totalRefunded: { type: Number, default: 0 },
    cancellationRequests: { type: [CancellationRequestSchema], default: [] },
    deliveryAddress: { type: Schema.Types.Mixed },
    deliveryMethod: { type: String, enum: DELIVERY_METHODS, default: 'pickup' },
    status: { type: String, enum: PAYMENT_STATUSES, default: 'pending' },
    orderStatus: { type: String, enum: ORDER_STATUSES, default: 'pending', index: true },
    statusHistory: { type: [StatusHistorySchema], default: [] },
    cancelReason: { type: String, default: '' },
    completedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    customerName: { type: String, default: '' },
    customerEmail: { type: String, default: '' },
    customerPhone: { type: String, default: '' },
  },
  { timestamps: true },
);

if (process.env.NODE_ENV === 'development' && mongoose.models.Order) {
  mongoose.deleteModel('Order');
}

const Order = mongoose.models.Order ?? mongoose.model<IOrder>('Order', OrderSchema);
export default Order;
