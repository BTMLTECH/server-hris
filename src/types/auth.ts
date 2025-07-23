import { IAttendance } from "../models/Attendance";
import { ICompany } from "../models/Company";
import { IUser } from "../models/user.model";
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
export interface InviteUserDTO {
firstName: string;
 lastName: string;
 middleName: string;
 email: string;
 department: string;
 biometryId: string
 role : string;
  startDate: string;
  salary: number;
  phoneNumber: string;
  dateOfBirth: string;
  position: string;
  address: string  
  status: string;}
  
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


export interface AdminUserInput {
  firstName: string;
  lastName: string;
  middleName?: string;
  email: string;
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


