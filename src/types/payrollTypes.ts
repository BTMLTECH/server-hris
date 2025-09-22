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

export interface PayrollParams {
  payrollId?: string;
}

export interface PayrollBulkBody {
  month: number;
  year: number;
}
export interface BulkPayrollBody {
  month: number;
  year: number;
}
export interface CreateBulkPayrollResponse {
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
}
