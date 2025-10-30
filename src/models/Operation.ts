import mongoose, { Document, Schema } from 'mongoose';

export interface IOperationReport extends Document {
  consultantName: string;
  shift: 'day' | 'night';
  clientName: string;
  PNR: string;
  ticketNumber: string;
  details: string;
  company: mongoose.Types.ObjectId;
  createdAt: Date;
}

const OperationReportSchema = new Schema<IOperationReport>(
  {
    consultantName: { type: String, required: true, trim: true },
    shift: { type: String, enum: ['day', 'night'], required: true },
    clientName: { type: String, required: true, trim: true },
    PNR: { type: String, required: true, trim: true },
    ticketNumber: { type: String, required: true, trim: true },
    details: { type: String, required: true, trim: true },
    company: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

export const OperationReport = mongoose.model<IOperationReport>(
  'OperationReport',
  OperationReportSchema,
);
