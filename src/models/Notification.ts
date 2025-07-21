import mongoose, { Document, Schema } from 'mongoose';
import { IUser } from './user.model';

export interface INotification extends Document {
  user: mongoose.Types.ObjectId ;
   type: | 'INFO'| 'WARNING'| 'ALERT'| 'NEW_LEAVE_REQUEST' 
  | 'LEAVE_AWAITING_REVIEW' | 'LEAVE_APPROVED' | 'LEAVE_REJECTED' 
  | 'LOAN_APPROVED' | 'LOAN_AWAITING_REVIEW' | 'NEW_LOAN_REQUEST' | 'LOAN_REJECTED' |
   'LOAN_REPAYMENT' |  'NEW_HANDOVER' | 'NEW_APPRAISAL'
    |'APPRAISAL_APPROVED'| 'APPRAISAL_REJECTED' |'PAYSLIP' |'NEW_PAYROLL';
  title: string;
  message: string;
  read: boolean;
  createdAt: Date;
  metadata?: Record<string, any>; // additional info like shift, date, etc.
  emailSubject?: string;
  emailTemplate?: string; // like 'absent-notice.ejs'
  emailData?: Record<string, any>;
}

const NotificationSchema = new Schema<INotification>({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: ['INFO', 'WARNING', 'ALERT', 'NEW_LEAVE_REQUEST', 
    'LEAVE_AWAITING_REVIEW', 'LEAVE_APPROVED', 'LEAVE_REJECTED',
     'LOAN_APPROVED' , 'LOAN_AWAITING_REVIEW' , 'NEW_LOAN_REQUEST' ,
      'LOAN_REJECTED' , 'LOAN_REPAYMENT', 'NEW_HANDOVER', 
      'NEW_APPRAISAL', 'PAYSLIP', 'NEW_PAYROLL',
       'APPRAISAL_APPROVED', 'APPRAISAL_REJECTED'], default: 'INFO' },
  title: { type: String, required: true },
  message: { type: String, required: true },
  read: { type: Boolean, default: false },
  metadata: { type: Schema.Types.Mixed },
  emailSubject: { type: String },
  emailTemplate: { type: String },
  emailData: { type: Schema.Types.Mixed },
  createdAt: { type: Date, default: Date.now },
});


export default mongoose.model<INotification>('Notification', NotificationSchema);
