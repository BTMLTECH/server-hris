import mongoose from "mongoose";
import { ILeaveRequest } from "../models/LeaveRequest"
import { IUser } from "../models/user.model";
import { ILeaveBalance } from "../models/LeaveBalance";


export interface CreateLeaveRequestBody {
  type: "compassionate" | "annual" | "maternity";
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
  teamleadId: string;
  typeIdentify: "leave";
  allowance?: "yes" | "no";
  relievers: string[];
}

export interface CreateLeaveRequestResponse {
  data: ILeaveRequest;
}

export interface ApproveLeaveRequestResponse {
  data: ILeaveRequest;
}
export interface ILeaveRequestPopulated extends Omit<ILeaveRequest, 'user'> {
  user: IUser;
}

export interface ApproveLeaveRequest {
  data: ILeaveRequestPopulated;
}

export interface GetLeaveActivityFeedDTO {
  status?: string;
  from?: string;
  to?: string;

}

export interface ReviewTrailItem {
  reviewer: string;
  role: string;
  action: 'approved' | 'rejected' | 'pending';
  date: string;
  note?: string;
}

export interface LeaveActivityFeedItem {
  id: string;
  employeeId: string;
  employeeName: string;
  type: 'annual' | 'sick' | 'maternity' | 'compensation';
  startDate: Date | string;
  endDate: Date | string;
  days: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  appliedDate: Date | string;
  teamleadId?: string;
  teamleadName?: string;
  reviewTrail?: ReviewTrailItem[];
}


export interface TeamLeaveActivityItem {
  employee?: string;
  email?: string;
  role?: string;
  type: string;
  startDate: Date;
  endDate: Date;
  days: number;
  status: string;
  appliedDate: Date;
}





export type PopulatedLeaveRequest = Omit<ILeaveRequest, 'user' | 'teamlead'> & {
  id: mongoose.Types.ObjectId;
  user: IUser;
  teamlead: IUser;
};


export interface LeaveActivitySummary {
  pending: number;
  approved: number;
  rejected: number;
}

export interface LeaveActivityFeedResponse {
  feed: LeaveActivityFeedItem[];
  summary: LeaveActivitySummary;
}



export interface CreateLeaveBalanceBody {
  user: string;
  balances?: {
    annual?: number;
    compassionate?: number;
    maternity?: number;
  };
  year?: number;
}

// instead of requiring full balances
export interface UpdateLeaveBalanceBody {
  leaveType: "annual" | "compassionate" | "maternity";
  balance: number;
  year?: number;
}




export interface PaginatedLeaveBalanceResponse {
  data: any;  
  pagination: {
    total: number;
    page: number;
    limit: number;
    pages: number;
  };
  count: number;
}

export interface SingleLeaveBalanceResponse {
  data: ILeaveBalance ;
}

export interface DeleteLeaveBalanceResponse {
  success: boolean;
  message: string;
  data: { id: string };
}
