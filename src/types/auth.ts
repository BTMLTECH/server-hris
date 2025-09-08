
import { AccountInfo, IUser, NextOfKin } from "../models/user.model";
import { PasswordConfig } from "../utils/passwordValidator";


// AUTHENTICATION

export interface LoginDTO{
  email: string;
  password: string;
}

export interface EmailDTO {
  email: string;
}
export interface Verify2FADTO {
  email: string;
  code: string;
}

  
export interface SetupPasswordDTO {
newPassword: string;
 passwordConfig: PasswordConfig;
 temporaryPassword: string;
 token: string
}

export interface SetupPasswordQuery {
  token?: string;
}

export interface  AuthData  {
  user?: IUser;
  token?: string | null;
  refreshToken?: string | null;
};

export interface CompanyRole {
  roles: string;  
}




export interface UserData {
  id: string;
  email: string;
  role: string;
  department: string;
  token: string
}

export interface CompanyData {
  id: string;
  name: string;
  description: string;
  roles: string;  
  status: string;
  department: string;
}
export interface CompanyBranding {
  displayName?: string;
  logoUrl?: string;
  primaryColor?: string;
}
export interface AdminUserInput {
  firstName: string;
  lastName: string;
  middleName?: string;
  email: string;
  title: "Mr" | "Mrs" | "Ms" | "Dr" | "Prof";
  gender: "male" | "female";
  staffId: string;
}
export interface CreateCompanyDTO {
  companyName: string;
  companyDescription?: string;
  adminData: AdminUserInput;
  branding?: CompanyBranding;
}

export interface AdminUserData {
  company: CompanyData;
  adminUser: UserData;
}
// types/apiResponses.ts or inline in the file
export interface BulkImportResponse {
  created: string[];
  updated: string[];
}

// Used for admin registration
export interface RegisterAdminDto {
  firstName: string;
  lastName: string;
  middleName?: string;
  email: string;
  password: string;
   role:
  | 'it'
  | 'account'
  | 'hr'
  | 'channel'
  | 'retail'
  | 'operation'
  | 'corporate'
  | 'marketing'
  | 'md';
  passwordConfig?: PasswordConfig;
}

// Used for employee setup
export interface SetPasswordDto {
  newPasswored: string;
  passwordConfig: PasswordConfig;
  temporaryPassword : string;
  token: string
}

export interface IActivationCode {
  token: string;
  activationCode: string;
}


export interface UserListResponse {
  count: number;
  data: IUser[];
};


export interface IOnboardingTask {
  name: string;
  category: 'training' | 'services' | 'device';
  completed: boolean;
  completedAt?: string; 
}

export interface IOnboardingRequirement {
  _id?: string;
  employee: string; 
  department: string;
  tasks: IOnboardingTask[];
  createdAt: string;
}

export interface PaginatedProfilesResponse {
  data: any;  
  pagination: {
    total: number;
    page: number;
    limit: number;
    pages: number;
  };
  count: number;
}





export interface InviteUserDTO {
  staffId: string;
  title: IUser["title"]; 
  firstName: string;
  lastName: string;
  middleName?: string;
  gender: IUser["gender"]; 
  dateOfBirth?: string | Date;
  stateOfOrigin?: string;
  address?: string;
  city?: string;
  mobile?: string;
  email: string;
  department: IUser["department"];
  position?: string;
  officeBranch?: IUser["officeBranch"];
  employmentDate?: string | Date;
  accountInfo?: AccountInfo;
  role: IUser["role"];
  nextOfKin?: NextOfKin;

  requirements?: Array<{
    department: string;
    tasks: Array<{
      name: string;
      category: string;
      completed?: boolean;
      completedAt?: string | Date;
    }>;
    createdAt?: string | Date;
  }>;
}
