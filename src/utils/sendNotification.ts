import Notification, { INotification } from '../models/Notification';
import { IUser } from '../models/user.model';
import { sendEmail } from './emailUtil';


interface NotificationOptions  {
  user: IUser;
  type: | 'INFO'| 'WARNING'| 'ALERT'| 'NEW_LEAVE_REQUEST' 
  | 'LEAVE_AWAITING_REVIEW' | 'LEAVE_APPROVED' | 'LEAVE_REJECTED' 
  | 'LOAN_APPROVED' | 'LOAN_AWAITING_REVIEW' | 'NEW_LOAN_REQUEST'
   | 'LOAN_REJECTED' | 'LOAN_REPAYMENT' | 'NEW_HANDOVER' |'NEW_APPRAISAL' 
   | 'APPRAISAL_APPROVED' | 'APPRAISAL_REJECTED' | 'PAYSLIP' | 'NEW_PAYROLL';
  title: string;
  message: string;
  metadata?: Record<string, any>;
  emailSubject?: string;
  emailTemplate?: string; // like 'absent-notice.ejs'
  emailData?: Record<string, any>;
}

export const sendNotification = async ({
  user,
  type,
  title,
  message,
  metadata,
  emailSubject,
  emailTemplate,
  emailData,
}: NotificationOptions) => {
  // Save in database
  await Notification.create({
    user: user._id,
    type,
    title,
    message,
    metadata,
  });

  // Optionally send email
  if (emailSubject && emailTemplate) {
    await sendEmail(user.email, emailSubject, emailTemplate, {
      name: user.firstName,
      ...emailData,
    });
  }
};
