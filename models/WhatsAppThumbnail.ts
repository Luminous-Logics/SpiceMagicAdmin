import mongoose, { Document, Model, Schema } from 'mongoose';

/**
 * A WhatsApp share thumbnail (Open Graph image) for the storefront preorder page.
 * Admins can upload many, but only ONE is active at a time — the active one is
 * what shows as the link preview when the menu is shared to WhatsApp.
 */
export interface IWhatsAppThumbnail extends Document {
  imageUrl: string;   // Cloudinary secure_url
  publicId: string;   // Cloudinary public_id — used to delete the image
  isActive: boolean;  // exactly one document should be active at any time
  uploadedByName?: string;
  createdAt: Date;
  updatedAt: Date;
}

const WhatsAppThumbnailSchema = new Schema<IWhatsAppThumbnail>(
  {
    imageUrl:       { type: String, required: true },
    publicId:       { type: String, required: true },
    isActive:       { type: Boolean, default: false, index: true },
    uploadedByName: { type: String },
  },
  // Explicit collection name so the admin and storefront apps read/write the same one.
  { timestamps: true, collection: 'whatsappthumbnails' }
);

if (process.env.NODE_ENV === 'development' && mongoose.models.WhatsAppThumbnail) {
  mongoose.deleteModel('WhatsAppThumbnail');
}

const WhatsAppThumbnail: Model<IWhatsAppThumbnail> =
  mongoose.models.WhatsAppThumbnail ??
  mongoose.model<IWhatsAppThumbnail>('WhatsAppThumbnail', WhatsAppThumbnailSchema);

export default WhatsAppThumbnail;
