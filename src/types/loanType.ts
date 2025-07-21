import { ILeaveRequest } from "../models/LeaveRequest"
import { ILoanRequest, LoanReviewLevel, LoanStatus } from "../models/LoanRequest";
import { IUser } from "../models/user.model";

export interface CreateLoanDTO {
 type: string, 
 amount: number,
 repaymentPeriod: number,
 reason: string,
 teamLead: string,
 note?: string
}

export interface CreateLoanResponse {
  data: ILoanRequest; // where user is ObjectId
}

export interface ILeaveRequestPopulated extends Omit<ILoanRequest, 'user'> {
  user: IUser;
}

export interface ApproveLoanRequest {
  data: ILeaveRequestPopulated;
}

export interface GetLoanActivityFeedDTO {
  status?: string;
  from?: string;
  to?: string;

}

export interface LoanActivityFeedItem {
  type: 'Personal' | 'Medical' | 'Emergency' | 'Other';
  amount: number;
  repaymentPeriod: number;
  status: LoanStatus;
  appliedDate: Date;
  lastReviewedBy: string | null;
  lastReviewDate: Date | null;
  lastReviewNote?: string | null;
  lastReviewAction?: LoanStatus | null;
}


export interface TeamLeaveActivityItem {
  type: string;
  startDate: Date;
  endDate: Date;
  days: number;
  status: string;
  appliedDate: Date;
}



export interface ILoanApprovalQueueItem {
  id: string;
  type: 'Personal' | 'Medical' | 'Emergency' | 'Other';
  amount: number;
  repaymentPeriod: number;
  monthlyDeduction: number;
  reason: string;
  status: LoanStatus;
  reviewLevel: LoanReviewLevel;
  appliedDate: Date;
  applicant: {
    id: string;
    name: string;
    email: string;
  };
  lastReviewedBy: string | null;
  lastReviewAction: LoanStatus | null;
  lastReviewDate: Date | null;
  lastReviewNote?: string | null;
}

export interface IMakeLoanRepaymentDTO {
  loanId: string;
  amountPaid: number;
}