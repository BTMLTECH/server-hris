import { IPayroll, ISalaryComponent } from "../models/Payroll";

export interface AllowanceOrDeduction {
  title: string;
  amount: number;
}

export interface CreatePayrollDTO {
  email: string;
  month: string;
  year: number;
  allowances: AllowanceOrDeduction[];
  deductions: AllowanceOrDeduction[];
}


export interface CreatePayrollResponse{
  data: IPayroll
  
}
export interface CreateBulkPayrollResponse{
   created: string[];
  failed: string[];   
}

export interface PayrollOverviewDTO {
   month: Date;
  year: string;   
}

export interface PayrollOverviewResponse {
  totalPayroll: number;    
  totalEmployees: number;  
  averageSalary: number;   
  totalDeductions: number;
}

export interface PayrollOverviewQuery {
  month?: string;
  year?: string;
};