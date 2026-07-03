import mongoose, { Document, Schema } from 'mongoose';

export const BANNER_SECTIONS = [
  'HERO',
  'CATEGORY_BANNER',
  'OFFER_STRIP',
  'HOT_DEALS',
] as const;

export type BannerSection = typeof BANNER_SECTIONS[number];

export const SECTION_LABELS: Record<BannerSection, string> = {
  HERO:            'Hero Slideshow',
  CATEGORY_BANNER: 'Category Banner',
  OFFER_STRIP:     'Offer Strip',
  HOT_DEALS:       'Hot Deals',
};

export interface IBanner extends Document {
  title?: string;
  subtitle?: string;
  description?: string;
  imageUrl: string;
  publicId?: string;
  section: BannerSection;
  redirectUrl?: string;
  displayOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const BannerSchema = new Schema<IBanner>(
  {
    title:        { type: String },
    subtitle:     { type: String },
    description:  { type: String },
    imageUrl:     { type: String, required: true },
    publicId:     { type: String },
    section:      { type: String, required: true, enum: BANNER_SECTIONS },
    redirectUrl:  { type: String },
    displayOrder: { type: Number, default: 0 },
    isActive:     { type: Boolean, default: true },
  },
  { timestamps: true }
);

BannerSchema.index({ section: 1, isActive: 1, displayOrder: 1 });

if (process.env.NODE_ENV === 'development' && mongoose.models.Banner) {
  mongoose.deleteModel('Banner');
}

const Banner = mongoose.models.Banner ?? mongoose.model<IBanner>('Banner', BannerSchema);
export default Banner;
