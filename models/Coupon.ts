import mongoose, { Document, Schema } from 'mongoose';

interface ICouponUsage {
  userId: string;
  usedAt: Date;
}

export interface ICoupon extends Document {
  code: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  minOrderAmount: number;
  maxDiscountAmount: number;
  usageLimit: number;
  usedCount: number;
  userUsageLimit: number;
  usedBy: ICouponUsage[];
  validFrom: Date;
  validTill: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const CouponSchema = new Schema<ICoupon>(
  {
    code: { type: String, required: true, unique: true, uppercase: true },
    discountType: { type: String, enum: ['percentage', 'fixed'], required: true },
    discountValue: { type: Number, required: true },
    minOrderAmount: { type: Number, default: 0 },
    maxDiscountAmount: { type: Number, default: 0 },
    usageLimit: { type: Number, default: 0 },
    usedCount: { type: Number, default: 0 },
    userUsageLimit: { type: Number, default: 0 },
    usedBy: [
      {
        userId: { type: String },
        usedAt: { type: Date, default: Date.now },
      },
    ],
    validFrom: { type: Date, required: true },
    validTill: { type: Date, required: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

CouponSchema.index({ code: 1 }, { unique: true });
CouponSchema.index({ isActive: 1, validTill: 1 });

if (process.env.NODE_ENV === 'development' && mongoose.models.Coupon) {
  mongoose.deleteModel('Coupon');
}

const Coupon = mongoose.models.Coupon ?? mongoose.model<ICoupon>('Coupon', CouponSchema);
export default Coupon;
