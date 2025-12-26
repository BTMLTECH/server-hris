import { NextFunction } from 'express';
import mongoose from 'mongoose';
import ErrorResponse from '../utils/ErrorResponse';
import { TypedRequest } from '../types/typedRequest';
import TaxInfo from '../models/TaxInfo';
import { logAudit } from '../utils/logAudit';
import { getMonthName, ExportService } from '../services/export.service';
import { sendNotification } from '../utils/sendNotification';
import User, { IUser } from '../models/user.model';
import pLimit from 'p-limit';
import { asyncHandler } from '../middleware/asyncHandler';
import { TypedResponse } from '../types/typedResponse';
import { uploadToCloudinary } from '../utils/cloudinary';
import PayrollNew from '../models/PayrollNew';
import { excludeRoles } from '../utils/excludeRoles';
import { BulkPayrollBody, PayrollBulkBody, PayrollParams } from '../types/payrollTypes';
import { monthNameToNumber } from '../utils/months';
import { calculatePayroll } from '../utils/payrollCalculator';
import { ICompany } from '../models/Company';
import { buildSimplePayrollSummary } from '../jobs/buildSimplePayrollSummary';

export const getAllPayrolls = asyncHandler(
  async (req: TypedRequest<{}, any, {}>, res: TypedResponse<any>, next: NextFunction) => {
    const user = req.user;
    const company = req.company;
    if (!user || !company)
      return next(new ErrorResponse('Unauthorized or no company context', 401));

    const { page = '1', limit = '20', sort = 'desc', employee, month, year, search } = req.query;

    const pageNum = Math.max(Number(page), 1);

    let maxLimit = 50;

    if (req.user?.role === 'admin') maxLimit = 100;
    else if (req.user?.role === 'hr') maxLimit = 100;
    else if (req.user?.role === 'md') maxLimit = 75;
    else maxLimit = 50;

    const limitNum = Math.min(Math.max(Number(limit) || 20, 1), maxLimit);
    const skip = (pageNum - 1) * limitNum;

    const matchStage: any = { company: company._id };
    if (user.role !== 'admin' && user.role !== 'hr') {
      matchStage.user = user._id;
      matchStage.status = 'paid';
    } else if (employee) matchStage.user = new mongoose.Types.ObjectId(employee);
    if (month) {
      const monthNum = monthNameToNumber(String(month));
      if (monthNum) matchStage.month = monthNum;
    }

    if (year) matchStage.year = Number(year);

    const pipeline: any[] = [
      { $match: matchStage },
      { $lookup: { from: 'users', localField: 'user', foreignField: '_id', as: 'user' } },
      { $unwind: '$user' },
      { $match: { 'user.status': 'active', 'user.isActive': true } },

      {
        $match: excludeRoles(),
      },
      { $lookup: { from: 'companies', localField: 'company', foreignField: '_id', as: 'company' } },
      { $unwind: '$company' },
    ];

    if (search) {
      const searchRegex = new RegExp(search.trim(), 'i');
      pipeline.push({
        $match: { $or: [{ 'user.firstName': searchRegex }, { 'user.lastName': searchRegex }] },
      });
    }

    pipeline.push(
      { $sort: { year: sort === 'asc' ? 1 : -1, month: sort === 'asc' ? 1 : -1 } },
      {
        $facet: {
          data: [{ $skip: skip }, { $limit: limitNum }],
          totalCount: [{ $count: 'count' }],
        },
      },
    );

    const results = await PayrollNew.aggregate(pipeline);
    const payrolls = results[0]?.data || [];
    const total = results[0]?.totalCount[0]?.count || 0;

    const payrollIds = payrolls.map((p: { _id: any }) => p._id);
    const taxInfos = await TaxInfo.find({ payrollId: { $in: payrollIds } }).lean();
    const taxInfoMap = new Map(taxInfos.map((t) => [t.payrollId.toString(), t]));
    const enrichedPayrolls = payrolls.map((p: { _id: { toString: () => string } }) => ({
      ...p,
      taxInfo: taxInfoMap.get(p._id.toString()) || null,
    }));

    await logAudit({
      userId: user._id,
      action: 'GET_ALL_PAYROLLS',
      status: 'SUCCESS',
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.status(200).json({
      success: true,
      message: 'Payrolls fetched successfully',
      data: {
        count: enrichedPayrolls.length,
        data: enrichedPayrolls,
        pagination: { total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) },
      },
    });
  },
);

export const deletePayroll = asyncHandler(
  async (req: TypedRequest<PayrollParams>, res: any, next: NextFunction) => {
    const payrollId = req.params.payrollId;
    const payroll = await PayrollNew.findById(payrollId);
    if (!payroll) return next(new ErrorResponse('Payroll not found', 404));

    await TaxInfo.findOneAndDelete({ payrollId });
    await PayrollNew.findByIdAndDelete(payrollId);

    await logAudit({
      userId: req.user?._id,
      action: 'DELETE_PAYROLL',
      status: 'SUCCESS',
      ip: req.ip,
      userAgent: req.get('user-agent') || '',
    });
    res.status(200).json({ success: true, message: 'Payroll deleted successfully' });
  },
);

export const markPayrollAsDraft = asyncHandler(
  async (req: TypedRequest<PayrollParams>, res: any, next: NextFunction) => {
    const { payrollId } = req.params;
    const company = req.company;
    const companyId = company?._id;
    const userId = req.user?._id;

    if (!companyId) return next(new ErrorResponse('Company not found', 404));

    const payroll = await PayrollNew.findById(payrollId).populate<{ user: IUser }>('user');
    if (!payroll) return next(new ErrorResponse('Payroll not found', 404));
    if (payroll.company.toString() !== companyId.toString())
      return next(new ErrorResponse('Payroll does not belong to your company', 403));
    if (payroll.status === 'draft')
      return next(new ErrorResponse('Payroll is already in draft status', 400));

    payroll.status = 'draft';
    await payroll.save();

    await logAudit({
      userId,
      action: 'MARK_PAYROLL_AS_DRAFT',
      status: 'SUCCESS',
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.status(200).json({
      success: true,
      message: `Payroll status updated to draft for ${payroll.user.firstName} ${payroll.user.lastName}`,
      data: payroll,
    });
  },
);

export const reverseSinglePayroll = asyncHandler(
  async (req: TypedRequest<PayrollParams>, res: any, next: NextFunction) => {
    const { payrollId } = req.params;
    const company = req.company;
    const companyId = company?._id;
    const userId = req.user?._id;

    if (!companyId) return next(new ErrorResponse('Company not found', 404));

    const payroll = await PayrollNew.findById(payrollId).populate<{ user: IUser }>('user');
    if (!payroll) return next(new ErrorResponse('Payroll not found', 404));
    if (payroll.company.toString() !== companyId.toString())
      return next(new ErrorResponse('Payroll does not belong to your company', 403));
    if (payroll.status === 'pending')
      return next(new ErrorResponse('Payroll is already in pending status', 400));

    payroll.status = 'pending';
    await payroll.save();

    await logAudit({
      userId,
      action: 'REVERSE_SINGLE_PAYROLL',
      status: 'SUCCESS',
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.status(200).json({
      success: true,
      message: `Payroll status updated to pending for ${payroll.user.firstName} ${payroll.user.lastName}`,
      data: payroll,
    });
  },
);

export const processSinglePayroll = asyncHandler(
  async (req: TypedRequest<PayrollParams>, res: any, next: NextFunction) => {
    const { payrollId } = req.params;
    const company = req.company;
    const companyId = company?._id;
    const userId = req.user?._id;

    const payroll = await PayrollNew.findById(payrollId).populate('user');
    if (!payroll) return next(new ErrorResponse('Payroll not found', 404));
    if (payroll.status !== 'draft')
      return next(new ErrorResponse('Only draft payrolls can be processed', 400));

    const employee = payroll.user as IUser;
    const excluded = excludeRoles().role.$nin;
    if (employee?.role && excluded.includes(employee.role.toLowerCase())) {
      return next(new ErrorResponse('Payroll cannot be processed for HR or Admin roles', 403));
    }
    const monthName = getMonthName(Number(payroll.month));

    const pdfBuffer = await ExportService.generatePayrollPDF(payroll, employee, company);
    const excelBuffer = await ExportService.generatePayrollExcel(payroll, employee, company);

    const pdfUpload = await uploadToCloudinary(
      pdfBuffer,
      `payroll/${companyId}`,
      'raw',
      `payroll_${employee.firstName}_${employee.lastName}_${monthName}_${payroll.year}.pdf`,
    );
    const excelUpload = await uploadToCloudinary(
      excelBuffer,
      `payroll/${companyId}`,
      'raw',
      `payroll_${employee.firstName}_${employee.lastName}_${monthName}_${payroll.year}.xlsx`,
    );

    const accountLead = await User.findOne({
      company: companyId,
      department: 'account',
      role: 'teamlead',
    });
    if (accountLead) {
      await sendNotification({
        user: accountLead,
        type: 'PAYSLIP',
        title: `Payroll Processed – ${employee.firstName} ${employee.lastName} (${monthName} ${payroll.year})`,
        message: `Payroll processed. Files available.`,
        emailSubject: `Payroll Processed – ${employee.firstName} ${employee.lastName} (${monthName} ${payroll.year})`,
        emailTemplate: 'payroll-notification.ejs',
        emailData: {
          name: accountLead.firstName,
          staffName: `${employee.firstName} ${employee.lastName}`,
          month: monthName,
          year: payroll.year,
          pdfUrl: pdfUpload.secure_url,
          excelUrl: excelUpload.secure_url,
          companyName: company?.branding?.displayName || company?.name,
        },
      });
    }

    payroll.status = 'processed';
    await payroll.save();

    await logAudit({
      userId,
      action: 'PROCESS_SINGLE_PAYROLL',
      status: 'SUCCESS',
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.status(200).json({
      success: true,
      message: 'Payroll processed successfully; team lead notified.',
      data: payroll,
    });
  },
);

export const markPayrollAsPaid = asyncHandler(
  async (req: TypedRequest<PayrollParams>, res: any, next: NextFunction) => {
    const { payrollId } = req.params;
    const company = req.company;
    const companyId = company?._id;
    const userId = req.user?._id;

    if (!companyId) return next(new ErrorResponse('Company not found', 404));

    const payroll = await PayrollNew.findById(payrollId).populate('user');
    if (!payroll) return next(new ErrorResponse('Payroll not found', 404));
    if (payroll.company.toString() !== companyId.toString())
      return next(new ErrorResponse('Payroll does not belong to your company', 403));
    if (payroll.status === 'paid')
      return next(new ErrorResponse('Payroll is already marked as paid', 400));

    payroll.status = 'paid';
    await payroll.save();

    const employee = payroll.user as IUser;
    const monthName = new Date(payroll.year, Number(payroll.month) - 1).toLocaleString('default', {
      month: 'long',
    });

    await sendNotification({
      user: employee,
      type: 'PAYSLIP',
      title: `Your Payslip for ${monthName} ${payroll.year} is Ready`,
      message: `Your payslip has been paid and is now available for download.`,
      emailSubject: `Payslip - ${monthName} ${payroll.year}`,
      emailTemplate: 'payslip-notification.ejs',
      emailData: {
        name: employee.firstName,
        month: monthName,
        year: payroll.year,
        companyName: company?.branding?.displayName || company?.name,
      },
    });

    await logAudit({
      userId,
      action: 'MARK_PAYROLL_AS_PAID',
      status: 'SUCCESS',
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.status(200).json({
      success: true,
      message: `Payroll marked as paid and employee ${employee.firstName} notified.`,
      data: payroll,
    });
  },
);

export const markPayrollsAsPaidBulk = asyncHandler(
  async (req: TypedRequest<{}, {}, PayrollBulkBody>, res: any, next: NextFunction) => {
    const { month, year } = req.body;
    const company = req.company;
    const companyId = company?._id;
    const userId = req.user?._id;

    if (!companyId) return next(new ErrorResponse('Company not found', 404));
    if (!month || !year) return next(new ErrorResponse('Month and year are required', 400));

    const payrolls = await PayrollNew.find({
      company: companyId,
      month,
      year,
      status: 'processed',
    }).populate({
      path: 'user',
      match: excludeRoles(), // exclude HR & Admin
    });

    // filter out excluded users
    const validPayrolls = payrolls.filter((p) => p.user);

    if (validPayrolls.length === 0) {
      return next(
        new ErrorResponse(`No processed payrolls found for ${getMonthName(month)} ${year}`, 404),
      );
    }

    const limit = pLimit(20);
    const results = await Promise.all(
      payrolls.map((payroll) =>
        limit(async () => {
          try {
            payroll.status = 'paid';
            await payroll.save();
            const employee = payroll.user as IUser;
            await sendNotification({
              user: employee,
              type: 'PAYSLIP',
              title: `Your Payslip for ${getMonthName(Number(payroll.month))} ${payroll.year} is Ready`,
              message: `Your payslip has been paid and is now available.`,
              emailSubject: `Payslip - ${getMonthName(Number(payroll.month))} ${payroll.year}`,
              emailTemplate: 'payslip-notification.ejs',
              emailData: {
                name: employee.firstName,
                month: getMonthName(Number(payroll.month)),
                year: payroll.year,
                companyName: company?.branding?.displayName || company?.name,
              },
            });
            return {
              success: true,
              payrollId: payroll._id,
              employee: `${employee.firstName} ${employee.lastName}`,
            };
          } catch (err: any) {
            return { success: false, payrollId: payroll._id, error: err.message };
          }
        }),
      ),
    );

    const successes = results.filter((r) => r.success);
    const failures = results.filter((r) => !r.success);

    await logAudit({
      userId,
      action: 'MARK_BULK_PAYROLL_AS_PAID',
      status: 'SUCCESS',
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.status(200).json({
      success: true,
      message: `Bulk payroll update completed for ${getMonthName(month)} ${year}. ${successes.length} paid, ${failures.length} failed.`,
      data: { successes, failures },
    });
  },
);

export const markPayrollsAsDraftBulk = asyncHandler(
  async (req: TypedRequest<{}, {}, BulkPayrollBody>, res: any, next: NextFunction) => {
    const { month, year } = req.body;
    const companyId = req.company?._id;
    const userId = req.user?._id;

    if (!companyId) return next(new ErrorResponse('Company not found', 404));
    if (!month || !year) return next(new ErrorResponse('Month and year are required', 400));

    const payrolls = await PayrollNew.find({
      company: companyId,
      month,
      year,
      status: { $ne: 'draft' },
    }).populate({
      path: 'user',
      match: excludeRoles(),
    });

    const validPayrolls = payrolls.filter((p) => p.user);

    if (validPayrolls.length === 0) {
      return next(
        new ErrorResponse(`No payrolls found to draft for ${getMonthName(month)} ${year}`, 404),
      );
    }

    const limit = pLimit(20);
    const results = await Promise.all(
      payrolls.map((payroll) =>
        limit(async () => {
          try {
            payroll.status = 'draft';
            await payroll.save();
            const employee = payroll.user as IUser;
            return {
              success: true,
              payrollId: payroll._id,
              employee: `${employee.firstName} ${employee.lastName}`,
            };
          } catch (err: any) {
            return { success: false, payrollId: payroll._id, error: err.message };
          }
        }),
      ),
    );

    const successes = results.filter((r) => r.success);
    const failures = results.filter((r) => !r.success);

    await logAudit({
      userId,
      action: 'MARK_BULK_PAYROLL_AS_DRAFT',
      status: 'SUCCESS',
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.status(200).json({
      success: true,
      message: `Bulk payroll draft completed for ${getMonthName(month)} ${year}. ${successes.length} drafted, ${failures.length} failed.`,
      data: { successes, failures },
    });
  },
);

export const reverseBulkPayroll = asyncHandler(
  async (req: TypedRequest<{}, {}, BulkPayrollBody>, res: any, next: NextFunction) => {
    const { month, year } = req.body;
    const companyId = req.company?._id;
    const userId = req.user?._id;

    if (!companyId) return next(new ErrorResponse('Company not found', 404));
    if (!month || !year) return next(new ErrorResponse('Month and year are required', 400));

    const payrolls = await PayrollNew.find({ company: companyId, month, year }).populate({
      path: 'user',
      match: excludeRoles(),
    });

    const validPayrolls = payrolls.filter((p) => p.user);

    if (validPayrolls.length === 0)
      return next(new ErrorResponse('No payrolls found for this period', 404));

    const reversed = [];
    const errors = [];

    for (const payroll of payrolls) {
      try {
        if (payroll.status === 'pending') {
          errors.push({ payrollId: payroll._id, error: 'Payroll is already in pending status' });
          continue;
        }
        payroll.status = 'pending';
        await payroll.save();
        reversed.push(payroll);
      } catch (err: any) {
        errors.push({ payrollId: payroll._id, error: err.message || 'Failed to reverse payroll' });
      }
    }

    if (reversed.length === 0) return next(new ErrorResponse('No payrolls were reversed', 400));

    await logAudit({
      userId,
      action: 'REVERSE_BULK_PAYROLL',
      status: 'SUCCESS',
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.status(200).json({
      success: true,
      message: `Bulk payroll reversal completed for ${getMonthName(month)} ${year}. ${reversed.length} payroll(s) reversed, ${errors.length} failed.`,
      data: { reversedCount: reversed.length, reversed },
      errors,
    });
  },
);

export const processBulkPayroll = asyncHandler(
  async (req: TypedRequest<{}, {}, BulkPayrollBody>, res: any, next: NextFunction) => {
    const { month, year } = req.body;
    const company = req.company;
    const companyId = company?._id;
    const userId = req.user?._id;

    if (!month || !year) return next(new ErrorResponse('Month and year are required', 400));

    const payrolls = await PayrollNew.find({
      company: companyId,
      month,
      year,
      status: 'draft',
    }).populate({
      path: 'user',
      match: excludeRoles(), // exclude hr + admin
    });

    const validPayrolls = payrolls.filter((p) => p.user);

    if (validPayrolls.length === 0)
      return next(new ErrorResponse(`No draft payrolls found for this period`, 404));

    const monthName = getMonthName(Number(month));

    const items = payrolls.map((payroll) => ({ payroll, employee: payroll.user as IUser }));

    const [pdfBuffer, excelBuffer] = await Promise.all([
      ExportService.generatePayrollPDF(items, company),
      ExportService.generatePayrollExcel(items, company),
    ]);

    const [pdfUpload, excelUpload] = await Promise.all([
      uploadToCloudinary(
        pdfBuffer,
        `payroll/${companyId}`,
        'raw',
        `bulk_${monthName}_${year}_payroll.pdf`,
      ),
      uploadToCloudinary(
        excelBuffer,
        `payroll/${companyId}`,
        'raw',
        `bulk_${monthName}_${year}_payroll.xlsx`,
      ),
    ]);

    const pdfUrl = pdfUpload.secure_url;
    const excelUrl = excelUpload.secure_url;

    await PayrollNew.updateMany(
      { _id: { $in: payrolls.map((p) => p._id) } },
      { $set: { status: 'processed' } },
    );

    const accountLead = await User.findOne({
      company: companyId,
      department: 'account',
      role: 'teamlead',
    });

    if (accountLead) {
      await sendNotification({
        user: accountLead,
        type: 'PAYSLIP',
        title: `Bulk Payroll Processed – ${payrolls.length} Employees`,
        message: `Payroll for ${payrolls.length} employees has been processed for ${monthName} ${year}. Files available below.`,
        emailSubject: `Bulk Payroll Processed – ${payrolls.length} Employees`,
        emailTemplate: 'payroll-notification.ejs',
        emailData: {
          name: accountLead.firstName,
          staffName: `${accountLead.firstName} ${accountLead.lastName}`,
          month: monthName,
          year,
          pdfUrl,
          excelUrl,
          companyName: company?.branding?.displayName || company?.name,
          logoUrl: company?.branding?.logoUrl,
          primaryColor: company?.branding?.primaryColor || '#0621b6b0',
        },
      });
    }

    await logAudit({
      userId,
      action: 'PROCESS_BULK_PAYROLL',
      status: 'SUCCESS',
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.status(200).json({
      success: true,
      message: `Bulk payroll processed for ${monthName} ${year}.`,
      data: { count: payrolls.length, pdfUrl, excelUrl },
    });
  },
);

export const generatePayrollForCurrentMonth = asyncHandler(
  async (req: TypedRequest, res: TypedResponse<any>, next: NextFunction) => {
    const user = req.user;
    const company = req.company;

    if (!user || !company)
      return next(new ErrorResponse("Unauthorized or no company context", 401));

    // Current month/year
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();


    const employees = await User.find({
      company: company._id,
      ...excludeRoles(),
    }).lean();


    let created = 0;

    for (const emp of employees) {
 



      const basicSalary = emp.accountInfo?.basicPay;
      const totalAllowances = emp.accountInfo?.allowances;

      // ❌ If any employee doesn’t have salary data → STOP EVERYTHING
      if (!basicSalary || !totalAllowances) {
        return next(
          new ErrorResponse(
            `Missing basicPay or allowances for employee: ${emp.firstName} ${emp.lastName}`,
            400
          )
        );
      }

      // ❌ If payroll already exists for ANY employee → STOP EVERYTHING
      const exists = await PayrollNew.findOne({
        user: emp._id,
        month,
        year,
      }).lean();

      if (exists) {
        return next(
          new ErrorResponse(
            `Payroll already generated for ${emp.firstName} ${emp.lastName} for ${month}/${year}`,
            400
          )
        );
      }

      const payrollResult = calculatePayroll({ basicSalary, totalAllowances });

      await PayrollNew.create({
        user: emp._id,
        company: company._id,
        basicSalary,
        totalAllowances,
        grossSalary: payrollResult.grossSalary,
        pension: payrollResult.pension,
        CRA: payrollResult.CRA,
        taxableIncome: payrollResult.taxableIncome,
        tax: payrollResult.tax,
        netSalary: payrollResult.netSalary,
        taxBands: payrollResult.taxBands,
        month,
        year,
        status: "pending",
      });

      created++;
    }


    await logAudit({
      userId: user._id,
      action: "GENERATE_CURRENT_MONTH_PAYROLL",
      status: "SUCCESS",
      ip: req.ip,
      userAgent: req.get("user-agent"),
    });

    return res.status(200).json({
      success: true,
      message: `Payroll generated for ${month}/${year}`,
      data: { created, totalEmployees: employees.length },
    });
  }
);



// export const exportPendingPayrollExcel = asyncHandler(
//     async (req: TypedRequest, res: TypedResponse<any>, next: NextFunction) => {
//     const company = req.company;
//     const companyId = company?._id;

//     // Backend owns default month/year
//     const now = new Date();
//     const month =  now.getMonth() + 1;

//     const year =  now.getFullYear();

//     // Basic validation
//     if (month < 1 || month > 12) {
//       return next(new ErrorResponse('Invalid month', 400));
//     }

//     if (year < 2000 || year > now.getFullYear()) {
//       return next(new ErrorResponse('Invalid year', 400));
//     }

//     // Fetch ALL payrolls (ignore pagination)
//     const payrolls = await PayrollNew.find({
//       company: companyId,
//       month,
//       year,
//       status: 'draft',
//     }).populate('user');

//     if (!payrolls.length) {
//       return next(
//         new ErrorResponse(`No draft payrolls for ${month}/${year}`, 404),
//       );
//     }

//     // Build summary
//     const summary = buildSimplePayrollSummary(
//       payrolls as any,
//       month,
//       year,
//     );
//     console.log('Payroll Summary:', summary);

//     const filename = `Payroll_${month}_${year}_Draft`;

//     // Reuse your existing Excel helper EXACTLY
//     return ExportService.exportPayrollExcel(
//       summary,
//       payrolls as any,
//       res,
//       filename,
//     );
//   },
// );
export const exportPendingPayroll = asyncHandler(
  async (req: TypedRequest, res: TypedResponse<any>, next: NextFunction) => {
    const company = req.company;
    const companyId = company?._id;

    const { type = 'excel' } = req.query as { type?: 'excel' | 'pdf' };

    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    if (month < 1 || month > 12) {
      return next(new ErrorResponse('Invalid month', 400));
    }

    if (year < 2000 || year > now.getFullYear()) {
      return next(new ErrorResponse('Invalid year', 400));
    }

    const payrolls = await PayrollNew.find({
      company: companyId,
      month,
      year,
      status: 'draft',
    }).populate('user');

    if (!payrolls.length) {
      return next(
        new ErrorResponse(`No draft payrolls for ${month}/${year}`, 404),
      );
    }

    const summary = buildSimplePayrollSummary(
      payrolls as any,
      month,
      year,
    );

    const filename = `Payroll_${month}_${year}_Draft`;

    // 🔀 SWITCH BASED ON TYPE
    if (type === 'pdf') {
      const buffer = await ExportService.exportPayrollSummaryPDF(
        summary,
        company as ICompany,
        { month, year },
      );

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${filename}.pdf"`,
      );

      return res.end(buffer);
    }

    // default → excel
    return ExportService.exportPayrollExcel(
      summary,
      payrolls as any,
      res,
      filename,
    );
  },
);
