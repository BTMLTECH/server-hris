import mongoose, { Document, Schema } from 'mongoose';
import { IUser } from './user.model';

export interface IAttendance extends Document {
  user: mongoose.Types.ObjectId | IUser;
  biometryId?: string;
  shift: 'day' | 'night';
  checkIn: Date;
  checkOut?: Date;
  status: 'present' | 'late' | 'absent' | 'on_leave';
  hoursWorked?: number;
  date: string; 
  company: mongoose.Types.ObjectId;
  isCheckedIn: boolean;
  department: string;
  createdAt: Date;
}

const AttendanceSchema = new Schema<IAttendance>({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  biometryId: { type: String, unique: true }, 
  shift: { type: String, enum: ['day', 'night'], required: true },
  checkIn: { type: Date, required: true },
  checkOut: { type: Date },
  status: { type: String, enum: ['present', 'late', 'absent', 'on_leave'], required: true },
  hoursWorked: { type: Number },
  date: { type: String, required: true },
  isCheckedIn: { type: Boolean, default: false },
  company: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
  department: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model<IAttendance>('Attendance', AttendanceSchema);





