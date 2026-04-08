import mongoose, { Document, Schema } from 'mongoose';

interface ITimeSlot {
  startTime: string;
  endTime: string;
}

export interface IPickupSlot extends Document {
  startDate: Date;
  endDate: Date;
  slots: ITimeSlot[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const PickupSlotSchema = new Schema<IPickupSlot>(
  {
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    slots: {
      type: [
        {
          startTime: { type: String, required: true },
          endTime: { type: String, required: true },
        },
      ],
      validate: {
        validator: (v: ITimeSlot[]) => v.length >= 1 && v.length <= 3,
        message: 'Must have 1 to 3 time slots',
      },
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

PickupSlotSchema.index({ startDate: 1, endDate: 1 });
PickupSlotSchema.index({ isActive: 1, startDate: 1 });

const PickupSlot: mongoose.Model<IPickupSlot> =
  (mongoose.models.PickupSlot as mongoose.Model<IPickupSlot>) ||
  mongoose.model<IPickupSlot>('PickupSlot', PickupSlotSchema);
export default PickupSlot;
