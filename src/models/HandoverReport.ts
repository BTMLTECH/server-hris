import mongoose, { Schema, Document } from 'mongoose';

export type HandoverStatus = 'submitted' | 'approved' | 'rejected';

export interface IHandoverReport extends Document {
  user: mongoose.Types.ObjectId;
  teamlead: mongoose.Types.ObjectId;
  date: Date;
  shift: 'day' | 'night';
  summary: string;
  pdfFile?: string;
  status: HandoverStatus;
  note?: string;
  employeename?: string;
  createdAt: Date;
}

const HandoverReportSchema = new Schema<IHandoverReport>({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  teamlead: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: Date, required: true },
  shift: { type: String, enum: ['day', 'night'], required: true },
  summary: { type: String, required: true },
  pdfFile: { type: String},
  status: { type: String, enum: ['submitted', 'approved', 'rejected'], default: 'submitted' },
  note: { type: String },
  employeename: { type: String },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model<IHandoverReport>('HandoverReport', HandoverReportSchema);
