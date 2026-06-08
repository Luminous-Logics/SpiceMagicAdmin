import mongoose, { Document, Model, Schema } from "mongoose";

export interface ICloverMerchant extends Document {
  merchantId: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date | null;
  merchantName?: string;
  connectedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const CloverMerchantSchema = new Schema<ICloverMerchant>(
  {
    merchantId:   { type: String, required: true, unique: true },
    accessToken:  { type: String, required: true },
    refreshToken: { type: String },
    expiresAt:    { type: Date, default: null },
    merchantName: { type: String },
    connectedAt:  { type: Date, default: Date.now },
  },
  { timestamps: true },
);

if (process.env.NODE_ENV === "development" && mongoose.models.CloverMerchant) {
  mongoose.deleteModel("CloverMerchant");
}

const CloverMerchant: Model<ICloverMerchant> =
  mongoose.models.CloverMerchant ??
  mongoose.model<ICloverMerchant>("CloverMerchant", CloverMerchantSchema);

export default CloverMerchant;
