import mongoose, { Document, Schema } from 'mongoose';
export interface IReport extends Document {
  name: string;
  week: number;
  task: string;
  company: mongoose.Types.ObjectId;
  createdAt: Date;
}

const ReportSchema = new Schema<IReport>(
  {
    name: { type: String, required: true, trim: true },
    week: { type: Number, required: true },
    task: { type: String, required: true, trim: true },
    company: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

export const Report = mongoose.model<IReport>('Report', ReportSchema);
