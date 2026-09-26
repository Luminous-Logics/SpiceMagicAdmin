import mongoose, { Document, Model, Schema } from 'mongoose';

export const FOOD_CATEGORIES = [
  'Starters',
  'Main Course',
  'Breads',
  'Rice & Biryani',
  'Snacks',
  'Desserts',
  'Beverages',
  'Combos',
  'Other',
] as const;

export type FoodCategory = typeof FOOD_CATEGORIES[number];

export const SPICE_LEVELS = ['none', 'mild', 'medium', 'hot'] as const;
export type SpiceLevel = typeof SPICE_LEVELS[number];

export interface IFoodItem extends Document {
  title: string;
  description?: string;
  imageUrl: string;
  publicId?: string;
  /** Price in cents, matching how product prices are stored everywhere else. */
  price: number;
  /** Units still available to preorder. Decremented as customers book. */
  quantity: number;
  category: FoodCategory;
  isVeg: boolean;
  spiceLevel: SpiceLevel;
  /** Minutes the vendor needs to prepare the item. */
  preparationTime?: number;
  /** Vendor / kitchen that sells this item. */
  vendorName?: string;
  displayOrder: number;
  isAvailable: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const FoodItemSchema = new Schema<IFoodItem>(
  {
    title:           { type: String, required: true, trim: true },
    description:     { type: String, trim: true },
    imageUrl:        { type: String, required: true },
    publicId:        { type: String },
    price:           { type: Number, required: true, min: 0 },
    quantity:        { type: Number, required: true, min: 0, default: 0 },
    category:        { type: String, required: true, enum: FOOD_CATEGORIES, default: 'Other' },
    isVeg:           { type: Boolean, default: true },
    spiceLevel:      { type: String, enum: SPICE_LEVELS, default: 'none' },
    preparationTime: { type: Number, min: 0 },
    vendorName:      { type: String, trim: true },
    displayOrder:    { type: Number, default: 0 },
    isAvailable:     { type: Boolean, default: true },
  },
  { timestamps: true }
);

FoodItemSchema.index({ isAvailable: 1, category: 1, displayOrder: 1 });

if (process.env.NODE_ENV === 'development' && mongoose.models.FoodItem) {
  mongoose.deleteModel('FoodItem');
}

const FoodItem: Model<IFoodItem> =
  mongoose.models.FoodItem ?? mongoose.model<IFoodItem>('FoodItem', FoodItemSchema);
export default FoodItem;
