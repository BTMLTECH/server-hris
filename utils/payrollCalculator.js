"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculatePayroll = void 0;
const calculatePayroll = ({ basicSalary, totalAllowances, }) => {
    basicSalary = Math.max(basicSalary, 0);
    totalAllowances = Math.max(totalAllowances, 0);
    const grossSalary = basicSalary + totalAllowances;
    const pension = 0.08 * basicSalary;
    const fixedCRA = Math.max(200000, 0.01 * grossSalary);
    const CRA = fixedCRA + 0.2 * grossSalary;
    let taxableIncome = Math.max(grossSalary - pension - CRA, 0);
    const bands = [
        { limit: 30000, rate: 0.07 },
        { limit: 30000, rate: 0.11 },
        { limit: 50000, rate: 0.15 },
        { limit: 50000, rate: 0.19 },
        { limit: 160000, rate: 0.21 },
        { limit: Infinity, rate: 0.24 },
    ];
    let remaining = taxableIncome;
    let tax = 0;
    const taxBands = [];
    for (const { limit, rate } of bands) {
        if (remaining <= 0)
            break;
        const amount = Math.min(remaining, limit);
        const bandTax = amount * rate;
        taxBands.push({
            band: Math.round(rate * 100), // store rate as %
            amount: bandTax,
        });
        tax += bandTax;
        remaining -= amount;
    }
    const netSalary = Math.max(grossSalary - pension - CRA - tax, 0);
    return {
        totalAllowances,
        grossSalary,
        pension,
        CRA,
        taxableIncome,
        tax,
        netSalary,
        taxBands,
    };
};
exports.calculatePayroll = calculatePayroll;
