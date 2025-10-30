import mongoose, { Document, Schema } from 'mongoose';

export interface IComms extends Document {
  sender: string;
  receiver: string;
  subject: string;
  message: string;
  dateSent: Date;
  status: 'sent' | 'delivered' | 'read';
  company: mongoose.Types.ObjectId;
}

const CommsSchema = new Schema<IComms>(
  {
    sender: { type: String, required: true },
    receiver: { type: String, required: true },
    subject: { type: String, required: true },
    message: { type: String, required: true },
    dateSent: { type: Date, default: Date.now },
    status: {
      type: String,
      enum: ['sent', 'delivered', 'read'],
      default: 'sent',
    },
    company: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
  },
  { timestamps: true },
);

export const Comms = mongoose.model<IComms>('Comms', CommsSchema);
