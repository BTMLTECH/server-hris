"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculatePayroll = void 0;
const calculatePayroll = (input) => {
    const { basicSalary, housingAllowance, transportAllowance, lasgAllowance, twentyFourHoursAllowance, healthAllowance, deductions, taxInfo } = input;
    const totalAllowances = housingAllowance + transportAllowance + lasgAllowance + twentyFourHoursAllowance + healthAllowance;
    const grossSalary = basicSalary + totalAllowances;
    const pensionRate = taxInfo?.pensionRate || 8;
    const CRApercentage = taxInfo?.CRApercentage || 20;
    const pension = (pensionRate / 100) * grossSalary;
    const CRA = (CRApercentage / 100) * basicSalary;
    const taxableIncome = grossSalary - pension - CRA;
    let remaining = taxableIncome;
    let tax = 0;
    if (taxInfo?.taxBands && Array.isArray(taxInfo.taxBands)) {
        for (const band of taxInfo.taxBands) {
            if (remaining <= 0)
                break;
            const taxableAtThisRate = Math.min(remaining, band.threshold);
            tax += (taxableAtThisRate * band.rate) / 100;
            remaining -= taxableAtThisRate;
        }
    }
    const totalDeductions = deductions.reduce((acc, cur) => acc + cur.amount, 0);
    const netSalary = grossSalary - pension - CRA - tax - totalDeductions;
    return {
        totalAllowances,
        grossSalary,
        pension,
        CRA,
        taxableIncome,
        tax,
        netSalary
    };
};
exports.calculatePayroll = calculatePayroll;
