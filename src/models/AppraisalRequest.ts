import mongoose, { Schema, Document } from "mongoose";

export interface IAppraisalObjective {
  id: string;
  category: "OBJECTIVES" | "FINANCIAL" | "CUSTOMER" | "INTERNAL_PROCESS" | "LEARNING_AND_GROWTH";
  name: string;
  marks: number;
  kpi: string;
  measurementTracker: string;
  employeeScore?: number;
  teamLeadScore?: number;
  finalScore?: number;
  employeeComments?: string;
  teamLeadComments?: string;
  evidence?: string;
}

export interface IReviewTrail {
  reviewer: mongoose.Types.ObjectId;
  role: string;
  action: string;
  date: Date;
  note?: string;
  marksGiven?: number;
}

export interface IAppraisalRequest extends Document {
  title: string;
  user: mongoose.Types.ObjectId;
  teamLeadId: mongoose.Types.ObjectId;
  department: string;
  period: string;
  typeIdentify: "appraisal";
  objectives: IAppraisalObjective[];
  status?: "pending" | "sent_to_employee" | "approved" | "rejected" | "submitted" | "needs_revision" | "awaiting_hr_review" | "update";
  reviewLevel: "teamlead" | "hr";
  reviewTrail: IReviewTrail[];
  totalScore: {
    employee: number;
    teamLead: number;
    final: number;
  };
  revisionReason?: string;
  hrAdjustments: {
    innovation: number;
    commendation: number;
    query: number;
    majorError: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

const AppraisalObjectiveSchema = new Schema<IAppraisalObjective>(
  {
    id: { type: String, required: true },
    category: {
      type: String,
      enum: ["OBJECTIVES", "FINANCIAL", "CUSTOMER", "INTERNAL_PROCESS", "LEARNING_AND_GROWTH"],
      required: true,
    },
    name: { type: String, required: true },
    marks: { type: Number, required: true },
    kpi: { type: String, required: true },
    measurementTracker: { type: String, required: true },
    employeeScore: { type: Number, default: 0 },
    teamLeadScore: { type: Number, default: 0 },
    finalScore: { type: Number, default: 0 },
    employeeComments: { type: String, default: "" },
    teamLeadComments: { type: String, default: "" },
    evidence: { type: String, default: "" },
  },
  { _id: false }
);

const AppraisalRequestSchema = new Schema<IAppraisalRequest>(
  {
    title: { type: String, required: true },
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    teamLeadId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    department: { type: String, required: true },
    period: { type: String, required: true },
    typeIdentify: { type: String, enum: ["appraisal"], required: true },
    objectives: [AppraisalObjectiveSchema],
    status: {
      type: String,
      enum: ["pending", "sent_to_employee", "approved", "rejected", "submitted", "needs_revision", "awaiting_hr_review", "update"],
      default: "pending",
    },
    reviewLevel: {
      type: String,
      enum: ["teamlead", "hr"],
      default: "teamlead",
    },
    reviewTrail: [
      {
        reviewer: { type: Schema.Types.ObjectId, ref: "User" },
        role: { type: String },
        action: { type: String },
        date: { type: Date },
        note: { type: String },
        marksGiven: { type: Number },
      },
    ],
    totalScore: {
      employee: { type: Number, default: 0 },
      teamLead: { type: Number, default: 0 },
      final: { type: Number, default: 0 },
    },
    revisionReason: { type: String, default: "" },
    hrAdjustments: {
      innovation: { type: Number, default: 0 },
      commendation: { type: Number, default: 0 },
      query: { type: Number, default: 0 },
      majorError: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

export default mongoose.model<IAppraisalRequest>("AppraisalRequest", AppraisalRequestSchema);
