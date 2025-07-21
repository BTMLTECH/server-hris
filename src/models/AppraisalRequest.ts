

import mongoose, { Schema, Document, Types } from 'mongoose';

export type AppraisalStatus = 'Pending' | 'Approved' | 'Rejected' | 'Disbursed' | 'Completed' | 'Expired';
export type AppraisalReviewLevel = 'teamlead'  | 'hr' | 'md';

export interface IAppraisalTarget {
  title: string;
  category: string;
  description: string;
  mark: number;
}

export interface IAppraisalReviewTrail {
  reviewer: Types.ObjectId;
  role: string;
  action: AppraisalStatus;
  date: Date;
  note?: string;
  marksGiven?: number;
}

export interface IAppraisalRequest extends Document {
  title: string;
  user: Types.ObjectId;
  teamLead: Types.ObjectId;
  period: string;
  dueDate: Date;
  totalScore: number;
  targets: IAppraisalTarget[];
  employeeMarks?: { title: string; mark: number }[];
  teamLeadMarks?: { title: string; mark: number }[];
  status: AppraisalStatus;
  reviewLevel: AppraisalReviewLevel;
  reviewTrail: IAppraisalReviewTrail[];
  createdAt: Date;
}

const AppraisalRequestSchema = new Schema<IAppraisalRequest>({
  title: { type: String, required: true },
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  teamLead: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  period: { type: String, required: true },
  dueDate: { type: Date, required: true },
  totalScore: { type: Number, required: true },
  targets: [
    {
      title: String,
      category: String,
      description: String,
      mark: Number,
    },
  ],
  employeeMarks: [
    {
      title: String,
      mark: Number,
    },
  ],
  teamLeadMarks: [
    {
      title: String,
      mark: Number,
    },
  ],
  status: {
    type: String,
    enum: ['Pending', 'Approved', 'Rejected', 'Disbursed', 'Completed', 'Expired'],
    default: 'Pending',
  },
  reviewLevel: {
    type: String,
    enum: ['teamlead', 'hod', 'hr', 'md'],
    default: 'teamlead',
  },
  reviewTrail: [
    {
      reviewer: { type: Schema.Types.ObjectId, ref: 'User' },
      role: String,
      action: String,
      date: Date,
      note: String,
      marksGiven: Number,
    },
  ],
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model<IAppraisalRequest>('AppraisalRequest', AppraisalRequestSchema);
