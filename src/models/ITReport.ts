import mongoose, { Document, Schema } from 'mongoose';

export interface IITReport extends Document {
  name: string;
  week: number;
  task: string;
  company: mongoose.Types.ObjectId;
  createdAt: Date;
}

const ITReportSchema = new Schema<IITReport>(
  {
    name: { type: String, required: true, trim: true },
    week: { type: Number, required: true },
    task: { type: String, required: true, trim: true },
    company: { type: Schema.Types.ObjectId, ref: "Company", required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// ✅ Use unique model name
export const ITReport = mongoose.model<IITReport>("ITReport", ITReportSchema);
