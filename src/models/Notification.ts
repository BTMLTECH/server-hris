import mongoose, { Document, Schema } from "mongoose";

export interface INotification extends Document {
  user: mongoose.Types.ObjectId;
  company?: mongoose.Types.ObjectId;
  type:
    | "INFO"
    | "WARNING"
    | "ALERT"
    | "NEW_LEAVE_REQUEST"
    | "INVITE"
    | "LEAVE_AWAITING_REVIEW"
    | "LEAVE_APPROVED"
    | "LEAVE_REJECTED"
    | "LOAN_APPROVED"
    | "LOAN_AWAITING_REVIEW"
    | "NEW_LOAN_REQUEST"
    | "LOAN_REJECTED"
    | "LOAN_REPAYMENT"
    | "NEW_HANDOVER"
    | "NEW_APPRAISAL"
    | "PAYSLIP"
    | "NEW_PAYROLL"
    | "COOPERATIVE_REQUEST"
    | "APPRAISAL_APPROVED"
    | "ACCOUNT_ACTIVATION"
    | "APPRAISAL_REJECTED";
  title: string;
  message: string;
  read: boolean;
  metadata?: Record<string, any>;
  emailSubject?: string;
  emailTemplate?: string;
  emailData?: Record<string, any>;
  createdAt: Date;
}

const NotificationSchema = new Schema<INotification>({
  user: { type: Schema.Types.ObjectId, ref: "User", required: true },
  company: { type: Schema.Types.ObjectId, ref: "Company" },
  type: {
    type: String,
    enum: [
      "INFO",
      "WARNING",
      "ALERT",
      "NEW_LEAVE_REQUEST",
      "INVITE",
      "LEAVE_AWAITING_REVIEW",
      "LEAVE_APPROVED",
      "LEAVE_REJECTED",
      "LOAN_APPROVED",
      "LOAN_AWAITING_REVIEW",
      "NEW_LOAN_REQUEST",
      "LOAN_REJECTED",
      "LOAN_REPAYMENT",
      "NEW_HANDOVER",
      "NEW_APPRAISAL",
      "PAYSLIP",
      "NEW_PAYROLL",
      "COOPERATIVE_REQUEST",
      "APPRAISAL_APPROVED",
      "APPRAISAL_REJECTED",
      "ACCOUNT_ACTIVATION"
    ],
    default: "INFO",
  },
  title: { type: String, required: true },
  message: { type: String, required: true },
  read: { type: Boolean, default: false },
  metadata: { type: Schema.Types.Mixed },
  emailSubject: { type: String },
  emailTemplate: { type: String },
  emailData: { type: Schema.Types.Mixed },
  createdAt: { type: Date, default: Date.now },
});

const Notification = mongoose.model<INotification>(
  "Notification",
  NotificationSchema
);

export default Notification;
