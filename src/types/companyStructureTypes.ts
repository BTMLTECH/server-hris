import { ICompanySalaryStructure } from "../models/CompanySalaryStructure";

export interface AllowanceOrDeduction {
  name: string;
  amount: number;
}

export interface CreateCompanySalaryDTO {
  basicSalary: number;
  allowances: AllowanceOrDeduction[];
  deductions: AllowanceOrDeduction[];
  taxPercentage: number;
}

export interface CreateCompanySalaryResponse {
  data: ICompanySalaryStructure;
}