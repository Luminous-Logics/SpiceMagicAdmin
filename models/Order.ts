import mongoose, { Document, Schema } from 'mongoose';

export interface IOrderItem {
  productId: string;
  name: string;
  price: number;
  discount: number;
  finalPrice: number;
  quantity: number;
  imageUrl: string;
}

export interface IOrder extends Document {
  userId: string;
  items: IOrderItem[];
  subtotal: number;
  couponCode: string;
  couponDiscount: number;
  total: number;
  stripePaymentIntentId: string;
  deliveryAddress: Record<string, unknown>;
  status: 'pending' | 'paid' | 'failed';
  createdAt: Date;
  updatedAt: Date;
}

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
      },
    ],
    subtotal: { type: Number, required: true },
    couponCode: { type: String, default: '' },
    couponDiscount: { type: Number, default: 0 },
    total: { type: Number, required: true },
    stripePaymentIntentId: { type: String, default: '' },
    deliveryAddress: { type: Schema.Types.Mixed },
    status: { type: String, enum: ['pending', 'paid', 'failed'], default: 'pending' },
  },
  { timestamps: true }
);

if (process.env.NODE_ENV === 'development' && mongoose.models.Order) {
  mongoose.deleteModel('Order');
}

const Order = mongoose.models.Order ?? mongoose.model<IOrder>('Order', OrderSchema);
export default Order;
