// jobs/generateMonthlyPayroll.ts
import ClassLevel from '../models/ClassLevel';
import PayrollNew from '../models/PayrollNew';
import User from '../models/user.model';
import { excludeRoles } from '../utils/excludeRoles';
import { calculatePayroll } from '../utils/payrollCalculator';
import { Types } from 'mongoose';

function getShiftedMonthYear(date = new Date(), offset = 1) {
  const d = new Date(date.getFullYear(), date.getMonth() + offset, 1);
  return { month: d.getMonth() + 1, year: d.getFullYear() };
}

async function findUserClassLevel(
  companyId: Types.ObjectId,
  level: number | undefined,
  payGrade: string,
  year: number,
) {
  if (level === undefined) return null;

  let cl = await ClassLevel.findOne({
    company: companyId,
    level,
    payGrade,
    year,
  }).lean();

  if (cl) return cl;

  cl = await ClassLevel.findOne({
    company: companyId,
    level,
    payGrade,
  })
    .sort({ year: -1, createdAt: -1 })
    .lean();

  return cl;
}

export const generateNextMonthPayroll = async () => {
  try {
    const { month, year } = getShiftedMonthYear(new Date(), 1);

    // Fetch all active users
    const users = await User.find({
      ...excludeRoles(),
    }).lean();

    let createdCount = 0;

    for (const user of users) {
      const companyId = user.company as Types.ObjectId;
      const userLevelRaw = user.position;
      const userClassLevel = user.accountInfo?.classLevel;

      if (!userLevelRaw) {
        continue;
      }

      const userLevel = Number(userLevelRaw.replace(/\D/g, ''));
      if (isNaN(userLevel)) {
        continue;
      }

      if (!userClassLevel) {
        continue;
      }

      const payGrade = `${year} ${userClassLevel}`;

      const cl = await findUserClassLevel(companyId, userLevel, payGrade, year);

      if (!cl || !cl.grossSalary) {
        continue;
      }

      const gross = cl.grossSalary;

      const basicSalary = gross * 0.55;
      const totalAllowances = gross * 0.45;

      // Compute payroll
      const p = calculatePayroll({ basicSalary, totalAllowances });

      // Check existing payroll
      const exists = await PayrollNew.findOne({
        user: user._id,
        month,
        year,
      }).lean();

      if (exists) {
        continue;
      }

      // Build payroll payload
      const payrollPayload = {
        user: user._id,
        company: companyId,
        classLevel: payGrade,
        basicSalary,
        totalAllowances,
        grossSalary: basicSalary + totalAllowances,
        pension: p.pension,
        CRA: p.CRA,
        taxableIncome: p.taxableIncome,
        tax: p.tax,
        netSalary: p.netSalary,
        taxBands: p.taxBands || [],
        month,
        year,
        status: 'pending',
      };

      // Insert payroll
      await PayrollNew.create(payrollPayload);
      createdCount++;
    }
  } catch (err) {}
};
