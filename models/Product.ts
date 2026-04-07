import mongoose, { Document, Schema } from 'mongoose';

export interface IProduct extends Document {
  productId: string;
  name: string;
  price: number;
  category: string;
  priceType: 'FIXED' | 'PER_UNIT';
  unitLabel: string;
  stock: number | null;
  totalSold: number;
  isHotDeal: boolean;
  discount: number;
  description: string;
  image: string;
  publicId: string;
  updatedAt: Date;
}

const ProductSchema = new Schema<IProduct>({
  productId:   { type: String, unique: true, index: true, required: true },
  name:        { type: String, required: true },
  price:       { type: Number, required: true },
  category:    { type: String },
  priceType:   { type: String, enum: ['FIXED', 'PER_UNIT'], default: 'FIXED' },
  unitLabel:   { type: String },
  stock:       { type: Number, default: null },
  totalSold:   { type: Number, default: 0 },
  isHotDeal:   { type: Boolean, default: false },
  discount:    { type: Number, default: 0, min: 0, max: 90 },
  description: { type: String, default: '' },
  image:       { type: String, default: '' },
  publicId:    { type: String, default: '' },
  updatedAt:   { type: Date, default: Date.now },
});

if (process.env.NODE_ENV === 'development' && mongoose.models.Product) {
  mongoose.deleteModel('Product');
}

const Product = mongoose.models.Product ?? mongoose.model<IProduct>('Product', ProductSchema);
export default Product;
