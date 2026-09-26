import mongoose, { Document, Model, Schema, Types } from 'mongoose';

/** A single field-level change captured during a food item edit. */
export interface IFoodItemChange {
  field: string;
  label: string;
  from: unknown;
  to: unknown;
}

/** One edit event — groups every field that changed in a single save. */
export interface IFoodItemHistory extends Document {
  foodItem: Types.ObjectId;
  changes: IFoodItemChange[];
  editedByName?: string;
  editedByEmail?: string;
  createdAt: Date;
}

const ChangeSchema = new Schema<IFoodItemChange>(
  {
    field: { type: String, required: true },
    label: { type: String, required: true },
    from:  { type: Schema.Types.Mixed },
    to:    { type: Schema.Types.Mixed },
  },
  { _id: false }
);

const FoodItemHistorySchema = new Schema<IFoodItemHistory>(
  {
    foodItem:      { type: Schema.Types.ObjectId, ref: 'FoodItem', required: true, index: true },
    changes:       { type: [ChangeSchema], default: [] },
    editedByName:  { type: String },
    editedByEmail: { type: String },
  },
  // We only ever append history rows, so an updatedAt would be noise.
  { timestamps: { createdAt: true, updatedAt: false } }
);

FoodItemHistorySchema.index({ foodItem: 1, createdAt: -1 });

if (process.env.NODE_ENV === 'development' && mongoose.models.FoodItemHistory) {
  mongoose.deleteModel('FoodItemHistory');
}

const FoodItemHistory: Model<IFoodItemHistory> =
  mongoose.models.FoodItemHistory ??
  mongoose.model<IFoodItemHistory>('FoodItemHistory', FoodItemHistorySchema);

export default FoodItemHistory;
