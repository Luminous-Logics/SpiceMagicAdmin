import mongoose, { Document, Schema } from 'mongoose';

export interface IUser extends Document {
  name: string;
  email: string;
  password: string;
  role: string;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    name: { type: String },
    email: { type: String, unique: true, required: true },
    password: { type: String },
    role: { type: String, default: 'user' },
  },
  { timestamps: true }
);

if (process.env.NODE_ENV === 'development' && mongoose.models.User) {
  mongoose.deleteModel('User');
}

const User = mongoose.models.User ?? mongoose.model<IUser>('User', UserSchema);
export default User;
