import { IAppraisalObjective, IAppraisalRequest } from "../models/AppraisalRequest";
import { IUser } from "../models/user.model";

export interface CreateAppraisalDTO {
  title: string;
  employee: string; // assuming ObjectId as string
  teamLead: string; // assuming ObjectId as string
  period: string;
  dueDate: string | Date;
  targets: {
    title: string;
    category: string;
    description: string;
    mark: number;
  }[];
}



export interface ILeaveRequestPopulated extends Omit<IAppraisalRequest, 'user'> {
  user: IUser;
}

export interface CreateAppraisalResponse {
     data: ILeaveRequestPopulated ;  
}

export interface UpdateAppraisalDto {
  title?: string;
  period?: string;
  dueDate?: Date;
  status?: IAppraisalRequest["status"];
  revisionReason?: string;
  objectives?: Partial<IAppraisalObjective>[];
  hrAdjustments?: {
    innovation?: number;
    commendation?: number;
    query?: number;
    majorError?: number;
  };
}

export interface GetAppraisalActivityQuery {
  page?: string;
  limit?: string;
  status?: IAppraisalRequest["status"] | "all";
}

export interface GetAppraisalActivityResponse {
  success: boolean;
  message: string;
  data: IAppraisalRequest[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    pages: number;
  };
}
