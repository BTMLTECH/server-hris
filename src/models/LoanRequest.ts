import mongoose, { Schema, Document } from 'mongoose';

export type LoanStatus = 'Pending' | 'Approved' | 'Rejected' | 'Disbursed' | 'Completed' | 'Expired';
export type LoanReviewLevel = 'teamlead' | 'hod' | 'hr' | 'md';

export interface ILoanReviewTrail {
  reviewer: mongoose.Types.ObjectId;
  role: string;
  action: LoanStatus;
  date: Date;
  note?: string;
}

export interface ILoanRequest extends Document {
  user: mongoose.Types.ObjectId;
  teamLead: mongoose.Types.ObjectId;
  type: 'Personal' | 'Medical' | 'Emergency' | 'Other';
  amount: number;
  repaymentPeriod: number; // in months
  monthlyDeduction: number;
  reason: string;
  status: LoanStatus;
  reviewLevel: LoanReviewLevel;
  reviewTrail: ILoanReviewTrail[];
  createdAt: Date;
  disbursedAt?: Date;
  completedAt?: Date;
}

const LoanRequestSchema = new Schema<ILoanRequest>({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  teamLead: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  type: {
    type: String,
    enum: ['Personal', 'Medical', 'Emergency', 'Other'],
    required: true,
  },
  amount: { type: Number, required: true },
  repaymentPeriod: { type: Number, required: true }, // months
  monthlyDeduction: { type: Number, required: true },
  reason: { type: String, required: true },
  status: {
    type: String,
    enum: ['Pending', 'Approved', 'Rejected', 'Disbursed', 'Completed', 'Expired'],
    default: 'Pending',
  },
  reviewLevel: {
    type: String,
    enum: ['teamlead', 'hod', 'hod', 'md'],
    default: 'teamlead',
  },
  reviewTrail: [
    {
      reviewer: { type: Schema.Types.ObjectId, ref: 'User' },
      role: String,
      action: {
        type: String,
        enum: ['Pending', 'Approved', 'Rejected', 'Disbursed', 'Completed', 'Expired'],
      },
      date: Date,
      note: String,
    },
  ],
  createdAt: { type: Date, default: Date.now },
  disbursedAt: { type: Date },
  completedAt: { type: Date },
});

export default mongoose.model<ILoanRequest>('LoanRequest', LoanRequestSchema);
