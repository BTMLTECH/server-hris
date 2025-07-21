import { IAppraisalRequest } from "../models/AppraisalRequest";
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
