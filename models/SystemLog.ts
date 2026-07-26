import mongoose, { Document, Schema } from 'mongoose';

/**
 * Append-only audit log for privileged admin actions (e.g. issuing a Clover
 * refund on cancellation approval). Entries are never edited or removed.
 */
export interface ISystemLog extends Document {
  action: string;
  /** Admin id/email that performed the action. */
  actorId: string;
  /** Related order, when applicable. */
  orderId?: string;
  /** Related cancellation-request sub-document id, when applicable. */
  requestId?: string;
  /** Arbitrary structured context (refund id, amount, error, ...). */
  meta: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const SystemLogSchema = new Schema<ISystemLog>(
  {
    action: { type: String, required: true, index: true },
    actorId: { type: String, default: '' },
    orderId: { type: String, default: '', index: true },
    requestId: { type: String, default: '' },
    meta: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

const SystemLog =
  mongoose.models.SystemLog ??
  mongoose.model<ISystemLog>('SystemLog', SystemLogSchema);
export default SystemLog;
