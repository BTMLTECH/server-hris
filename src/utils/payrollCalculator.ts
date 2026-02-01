export interface CalculatePayrollInput {
  basicSalary: number;
  totalAllowances: number; 
}

export interface TaxBand {
  band: number;   
  amount: number; 
}

export interface CalculatePayrollResult {
  totalAllowances: number;
  grossSalary: number;
  pension: number;
  CRA: number;
  taxableIncome: number;
  tax: number;
  netSalary: number;
  taxBands: TaxBand[];
}

export const calculatePayroll = ({
  basicSalary,
  totalAllowances,
  
}: CalculatePayrollInput): CalculatePayrollResult => {
  basicSalary = Math.max(basicSalary, 0);
  totalAllowances = Math.max(totalAllowances, 0);
  

  const grossSalary = basicSalary + totalAllowances;
  const pension = 0.08 * basicSalary;

  const fixedCRA = Math.max(200_000, 0.01 * grossSalary);
  const CRA = fixedCRA + 0.2 * grossSalary;

  let taxableIncome = Math.max(grossSalary - pension - CRA, 0);

  const bands = [
    { limit: 30_000, rate: 0.07 },
    { limit: 30_000, rate: 0.11 },
    { limit: 50_000, rate: 0.15 },
    { limit: 50_000, rate: 0.19 },
    { limit: 160_000, rate: 0.21 },
    { limit: Infinity, rate: 0.24 },
  ];

  let remaining = taxableIncome;
  let tax = 0;
  const taxBands: TaxBand[] = [];

  for (const { limit, rate } of bands) {
    if (remaining <= 0) break;
    const amount = Math.min(remaining, limit);
    const bandTax = amount * rate;

    taxBands.push({
      band: Math.round(rate * 100),
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
