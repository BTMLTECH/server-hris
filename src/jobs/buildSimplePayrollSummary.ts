import { IPayroll } from "../models/PayrollNew";
import { IUser } from "../models/user.model";

export const buildSimplePayrollSummary = (
  payrolls: (IPayroll & { user: IUser })[],
  month: number,
  year: number,
) => {
  return {
    month,
    year,
    totalStaff: payrolls.length,
    totalBasicSalary: payrolls.reduce((s, p) => s + p.basicSalary, 0),
    totalAllowances: payrolls.reduce((s, p) => s + p.totalAllowances, 0),
    totalGrossSalary: payrolls.reduce((s, p) => s + p.grossSalary, 0),
    totalPension: payrolls.reduce((s, p) => s + p.pension, 0),
    totalCRA: payrolls.reduce((s, p) => s + p.CRA, 0),
    totalTaxableIncome: payrolls.reduce((s, p) => s + p.taxableIncome, 0),
    totalTax: payrolls.reduce((s, p) => s + p.tax, 0),
    totalNetSalary: payrolls.reduce((s, p) => s + p.netSalary, 0),
  };
};
