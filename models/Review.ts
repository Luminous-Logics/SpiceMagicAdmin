import mongoose, { Document, Schema } from 'mongoose';

export interface IReview extends Document {
  productId: string;
  userId: string;
  name: string;
  email: string;
  rating: number;
  comment: string;
  isApproved: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ReviewSchema = new Schema<IReview>(
  {
    productId: { type: String, index: true, required: true },
    userId: { type: String },
    name: { type: String, required: true },
    email: { type: String, required: true, lowercase: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, required: true },
    isApproved: { type: Boolean, default: true },
  },
  { timestamps: true }
);

ReviewSchema.index({ productId: 1, createdAt: -1 });
ReviewSchema.index({ productId: 1, email: 1 });

if (process.env.NODE_ENV === 'development' && mongoose.models.Review) {
  mongoose.deleteModel('Review');
}

const Review = mongoose.models.Review ?? mongoose.model<IReview>('Review', ReviewSchema);
export default Review;
