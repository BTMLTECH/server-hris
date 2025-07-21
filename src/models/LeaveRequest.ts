import mongoose, { Schema, Document } from 'mongoose';

export type LeaveStatus = 'Pending' | 'Approved' | 'Rejected' | 'Expired';
export type ReviewLevel = 'teamlead' | 'hr' | 'md';


export interface IReviewTrail {
  reviewer: mongoose.Types.ObjectId;
  role: string;
  action: LeaveStatus;
  date: Date;
  note?: string;
}


export interface ILeaveRequest extends Document {
  user: mongoose.Types.ObjectId;
  teamlead: mongoose.Types.ObjectId;
  type: 'compensation' | 'sick' | 'annual' | 'maternity';
  startDate: Date;
  endDate: Date;
  days: number;
  reason: string;
  status: LeaveStatus;
  reviewLevel: ReviewLevel;
  reviewTrail: IReviewTrail[];
  createdAt: Date;
}

const LeaveRequestSchema = new Schema<ILeaveRequest>({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  teamlead: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  type: {
    type: String,
    enum: ['compensation', 'sick', 'annual', 'maternity'],
    required: true,
  },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  days: { type: Number, required: false },

  reason: { type: String, required: true },
  status: { type: String, enum: ['Pending', 'Approved', 'Rejected'], default: 'Pending' },
  reviewLevel: { type: String, enum: ['teamlead', 'hr', 'md'], default: 'teamlead' },
  reviewTrail: [
    {
      reviewer: { type: Schema.Types.ObjectId, ref: 'User' },
      role: String,
      action: { type: String, enum: ['Pending', 'Approved', 'Rejected', 'Expired'] },
      date: Date,
      note: String,
    },
  ],
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model<ILeaveRequest>('LeaveRequest', LeaveRequestSchema);
