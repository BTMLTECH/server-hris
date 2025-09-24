import mongoose, { Schema, Document } from 'mongoose';

export interface IBirthday extends Document {
  user: mongoose.Types.ObjectId;
  company: mongoose.Types.ObjectId;
  staffId: string;
  firstName: string;
  lastName: string;
  email: string;
  profileImage?: string;
  dateOfBirth: Date;
  dateCelebrated?: Date;
  month: number;
  day: number;
  year: number;
  createdAt: Date;
}

const BirthdaySchema = new Schema<IBirthday>({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  company: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
  staffId: { type: String, required: true },
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  email: { type: String, required: true },
  profileImage: String,
  dateOfBirth: { type: Date, required: true },
  dateCelebrated: { type: Date, default: null },
  month: { type: Number, required: true },
  day: { type: Number, required: true },
  year: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model<IBirthday>('Birthday', BirthdaySchema);
