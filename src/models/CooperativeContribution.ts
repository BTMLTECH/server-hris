import mongoose, { Schema, Document } from 'mongoose';

export type ContributionStatus = "REQUEST" | "APPROVED" | "COLLECTED" | "REJECTED";

export interface ICooperativeContribution extends Document {
  user: mongoose.Types.ObjectId;
  companyId: mongoose.Types.ObjectId;
  month: number; 
  year: number;  
  amount: number;
  receiptUrl: string;
  status: ContributionStatus;  
}

const CooperativeContributionSchema = new Schema<ICooperativeContribution>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
    month: { type: Number, required: true, min: 1, max: 12 },
    year: { type: Number, required: true },
    amount: { type: Number, required: true, min: 0 },
    receiptUrl: { type: String, required: true },
    status: { 
      type: String, 
      enum: ["REQUEST", "APPROVED", "COLLECTED", "REJECTED"], 
      default: "REQUEST" 
    }
  }, 
  { timestamps: true }
);

export const CooperativeContribution = mongoose.model<ICooperativeContribution>(
  'CooperativeContribution',
  CooperativeContributionSchema
);
