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
  stripePaymentIntentId: string;
  deliveryAddress: Record<string, unknown>;
  deliveryMethod: 'pickup' | 'delivery';
  /** Payment status (legacy field). */
  status: 'pending' | 'paid' | 'failed';
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
      },
    ],
    subtotal: { type: Number, required: true },
    tax: { type: Number, default: 0 },
    deliveryFee: { type: Number, default: 0 },
    couponCode: { type: String, default: '' },
    couponDiscount: { type: Number, default: 0 },
    total: { type: Number, required: true },
    stripePaymentIntentId: { type: String, default: '' },
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
