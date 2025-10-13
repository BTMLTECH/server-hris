import mongoose, { Schema, Document } from 'mongoose';
import { IUser } from './user.model';

export interface IFacilitator {
  name: string;
  email?: string; // ✅ optional
}

const FacilitatorSchema = new Schema<IFacilitator>(
  {
    name: { type: String, required: true },
    email: { type: String, required: false },
  },
  { _id: false },
);

export interface IFeedback {
  user: mongoose.Types.ObjectId | IUser;
  department: string;
  answers: {
    question: string;
    response: string;
  }[];
  additionalComments?: string;
  submittedAt?: Date;
  status: 'pending' | 'submitted';
}

export interface IParticipant {
  id: mongoose.Types.ObjectId;
  firstName: string;
  middleName?: string;
  lastName: string;
  email: string;
  department: string;
  position?: string;
  role: string;
  staffId: string;
  status: 'pending' | 'submitted';
}

export interface ITraining extends Document {
  title: string;
  date: Date;
  department: string;
  // trainer: string;
  facilitators: IFacilitator[];
  noOfTrainees: number;
  company: mongoose.Types.ObjectId;
  participantEmails: string[];
  participants: IParticipant[];
  questions: string[];
  feedbacks: IFeedback[];
  status: 'pending' | 'submitted';
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
}

const FeedbackSchema = new Schema<IFeedback>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    department: { type: String, required: true },
    answers: [
      {
        question: { type: String, required: true },
        response: {
          type: String,
          enum: ['AGREE', 'STRONGLY AGREE', 'DISAGREE', 'AVERAGE', 'EXCELLENT'],
          required: true,
        },
      },
    ],
    additionalComments: String,
    submittedAt: Date,
    status: {
      type: String,
      enum: ['pending', 'submitted'],
      default: 'pending',
    },
  },
  { _id: false },
);

const ParticipantSchema = new Schema<IParticipant>(
  {
    id: { type: Schema.Types.ObjectId, ref: 'User' },
    firstName: String,
    middleName: String,
    lastName: String,
    email: String,
    department: String,
    position: String,
    role: String,
    staffId: String,
    status: {
      type: String,
      enum: ['pending', 'submitted'],
      default: 'pending',
    },
  },
  { _id: false },
);

const TrainingSchema = new Schema<ITraining>({
  title: { type: String, required: true },
  date: { type: Date, required: true },
  department: { type: String, required: true },
  // trainer: { type: String, required: true },
  facilitators: { type: [FacilitatorSchema], required: true },
  noOfTrainees: { type: Number, required: true },
  company: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
  participantEmails: [{ type: String, required: true }],

  participants: [ParticipantSchema],
  questions: [{ type: String, required: true }],
  feedbacks: [FeedbackSchema],

  status: {
    type: String,
    enum: ['pending', 'submitted'],
    default: 'pending',
  },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now },
});

export const Training = mongoose.model<ITraining>('Training', TrainingSchema);
