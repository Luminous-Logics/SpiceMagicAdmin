import mongoose, { Document, Schema } from 'mongoose';

export interface ICategory extends Document {
  cloverCategoryId: string;
  name: string;
  image: string;
  publicId: string;
  isFeatured: boolean;
  sortOrder: number;
  lastSyncedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const CategorySchema = new Schema<ICategory>(
  {
    cloverCategoryId: { type: String, unique: true, required: true },
    name: { type: String, required: true },
    image: { type: String, default: '' },
    publicId: { type: String, default: '' },
    isFeatured: { type: Boolean, default: false },
    sortOrder: { type: Number, default: 0 },
    lastSyncedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

if (process.env.NODE_ENV === 'development' && mongoose.models.Category) {
  mongoose.deleteModel('Category');
}

const Category = mongoose.models.Category ?? mongoose.model<ICategory>('Category', CategorySchema);
export default Category;
