import { ISalaryComponent } from '../models/Payroll';

export interface CalculatePayrollInput {
  basicSalary: number;
  allowances: ISalaryComponent[];
  deductions: ISalaryComponent[];
  taxPercentage: number; 
}

interface CalculatePayrollResult {
  grossSalary: number;
  taxAmount: number;
  totalDeductions: number;
  netSalary: number;
  taxPercentage: number;
}

export const calculatePayroll = ({
  basicSalary,
  allowances,
  deductions,
  taxPercentage = 0,  // ✅ Defaults to 0% tax if not provided
}: CalculatePayrollInput): CalculatePayrollResult => {
  const totalAllowances = allowances.reduce((sum, item) => sum + item.amount, 0);
  const grossSalary = basicSalary + totalAllowances;

  const fixedDeductions = deductions.reduce((sum, item) => sum + item.amount, 0);
  const taxAmount = (taxPercentage / 100) * grossSalary;

  const totalDeductions = fixedDeductions + taxAmount;
  const netSalary = grossSalary - totalDeductions;

  return {
    grossSalary,
    taxAmount,
    totalDeductions,
    netSalary,
    taxPercentage
  };
};
