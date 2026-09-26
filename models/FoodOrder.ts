import mongoose, { Document, Model, Schema } from 'mongoose';

/**
 * Food preorders are bookings, not sales — no payment is ever taken, so this
 * model deliberately has no payment or Clover fields.
 */
export const FOOD_ORDER_STATUSES = [
  'pending',
  'confirmed',
  'preparing',
  'ready',
  'completed',
  'cancelled',
] as const;

export type FoodOrderStatus = typeof FOOD_ORDER_STATUSES[number];

export const FOOD_ORDER_STATUS_LABELS: Record<FoodOrderStatus, string> = {
  pending:   'Pending',
  confirmed: 'Confirmed',
  preparing: 'Preparing',
  ready:     'Ready',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export interface FoodOrderItem {
  foodItemId: mongoose.Types.ObjectId;
  title: string;
  /** Per-unit price in cents, snapshotted so later edits don't rewrite history. */
  price: number;
  quantity: number;
  imageUrl?: string;
}

export interface FoodOrderCustomer {
  name: string;
  phone: string;
  email?: string;
}

export interface IFoodOrder extends Document {
  orderNumber: string;
  userId: mongoose.Types.ObjectId | null;
  customer: FoodOrderCustomer;
  items: FoodOrderItem[];
  /** Sum of price * quantity across items, in cents. */
  totalAmount: number;
  notes?: string;
  status: FoodOrderStatus;
  /** Guards against double-crediting stock if an order is cancelled twice. */
  stockRestored: boolean;
  adminNote?: string;
  createdAt: Date;
  updatedAt: Date;
}

const FoodOrderItemSchema = new Schema<FoodOrderItem>(
  {
    foodItemId: { type: Schema.Types.ObjectId, ref: 'FoodItem', required: true },
    title:      { type: String, required: true },
    price:      { type: Number, required: true },
    quantity:   { type: Number, required: true, min: 1 },
    imageUrl:   { type: String },
  },
  { _id: false }
);

const FoodOrderCustomerSchema = new Schema<FoodOrderCustomer>(
  {
    name:  { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
  },
  { _id: false }
);

const FoodOrderSchema = new Schema<IFoodOrder>(
  {
    orderNumber:   { type: String, required: true, unique: true },
    userId:        { type: Schema.Types.ObjectId, ref: 'User', default: null },
    customer:      { type: FoodOrderCustomerSchema, required: true },
    items:         { type: [FoodOrderItemSchema], required: true },
    totalAmount:   { type: Number, required: true },
    notes:         { type: String, trim: true },
    status:        { type: String, enum: FOOD_ORDER_STATUSES, default: 'pending' },
    stockRestored: { type: Boolean, default: false },
    adminNote:     { type: String, trim: true },
  },
  { timestamps: true }
);

FoodOrderSchema.index({ status: 1, createdAt: -1 });
FoodOrderSchema.index({ userId: 1, createdAt: -1 });

if (process.env.NODE_ENV === 'development' && mongoose.models.FoodOrder) {
  mongoose.deleteModel('FoodOrder');
}

const FoodOrder: Model<IFoodOrder> =
  mongoose.models.FoodOrder ?? mongoose.model<IFoodOrder>('FoodOrder', FoodOrderSchema);
export default FoodOrder;
