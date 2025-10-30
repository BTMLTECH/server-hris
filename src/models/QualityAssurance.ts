import mongoose, { Document, Schema } from 'mongoose';

export interface IQualityAssurance extends Document {
  agentName: string;
  week: number;
  score: number;
  remarks?: string;
  evaluatedBy?: string;
  company: mongoose.Types.ObjectId;
  createdAt: Date;
}

const QualityAssuranceSchema = new Schema<IQualityAssurance>(
  {
    agentName: { type: String, required: true, trim: true },
    week: { type: Number, required: true },
    score: { type: Number, required: true, min: 0, max: 100 },
    remarks: { type: String },
    evaluatedBy: { type: String },
    company: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

export const QualityAssurance = mongoose.model<IQualityAssurance>(
  'QualityAssurance',
  QualityAssuranceSchema,
);
