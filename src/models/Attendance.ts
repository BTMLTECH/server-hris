import mongoose, { Schema, Document } from 'mongoose';

export interface IAttendance extends Document {
  user: mongoose.Types.ObjectId;
  shift: 'day' | 'night';
  checkIn: Date;
  checkOut?: Date;
  status: 'present' | 'late' | 'absent' | 'on_leave';
  hoursWorked?: number;
  date: string; // looks like you’re storing as string not Date
  isCheckedIn: boolean;
  company: mongoose.Types.ObjectId;
  department: string;
  createdAt: Date;
}

const AttendanceSchema = new Schema<IAttendance>({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  shift: { type: String, enum: ['day', 'night'], required: true },
  checkIn: { type: Date, required: true },
  checkOut: { type: Date },
  status: {
    type: String,
    enum: ['present', 'late', 'absent', 'on_leave'],
    required: true,
  },
  hoursWorked: { type: Number },
  date: { type: String, required: true },
  isCheckedIn: { type: Boolean, default: false },
  company: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
  department: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model<IAttendance>('Attendance', AttendanceSchema);
