

import { NextFunction } from 'express';
import CompanySalaryStructure from '../models/CompanySalaryStructure';
import Payroll from '../models/Payroll'; 
import { TypedRequest } from '../types/typedRequest';
import { TypedResponse } from '../types/typedResponse';
import ErrorResponse from '../utils/ErrorResponse';
import { logAudit } from '../utils/logAudit';
import { sendNotification } from '../utils/sendNotification';
import User, {IUser} from '../models/user.model';
import { parseExcelPayroll } from '../utils/excelParser';
import { calculatePayroll } from '../utils/calculatePayroll';
import { CreateBulkPayrollResponse, CreatePayrollDTO, CreatePayrollResponse, PayrollOverviewDTO, PayrollOverviewResponse } from '../types/payrollTypes';

export const createPayroll = async (
  req: TypedRequest<{}, {}, CreatePayrollDTO>,
  res: TypedResponse<CreatePayrollResponse>,
  next: NextFunction
) => {
  try {
    const { email, month, year, allowances, deductions } = req.body;

    if (!email || !month || !year) {
      return next(new ErrorResponse('Employee email, month, and year are required', 400));
    }

    const employee = await User.findOne({ email });

    if (!employee) {
      return next(new ErrorResponse('Employee not found', 404));
    }

    const companyStructure = await CompanySalaryStructure.findOne({ company: employee.company });

    if (!companyStructure) {
      return next(new ErrorResponse('Company salary structure not found', 404));
    }

    const calculated = calculatePayroll({
      basicSalary: companyStructure.basicSalary,
      allowances: allowances || [],
      deductions: deductions || [],
      taxPercentage: companyStructure.taxPercentage,
    });

    const payroll = await Payroll.create({
      employee: employee._id,
      company: employee.company,
      month,
      year,
      basicSalary: companyStructure.basicSalary,
      allowances,
      deductions,
      grossSalary: calculated.grossSalary,
      netSalary: calculated.netSalary,
      tax: calculated.taxPercentage,
      status: 'Paid',
      paidDate: new Date(),
    });

    await sendNotification({
      user: employee,
      type: 'PAYSLIP',
      title: 'Your Payslip is Ready',
      message: `Your payslip for ${month} ${year} has been generated.`,
      metadata: {
        month,
        year,
        netSalary: calculated.netSalary,
      },
      emailSubject: 'Your Payslip is Ready',
      emailTemplate: 'payslip-notification.ejs',
      emailData: {
        name: employee.firstName,
        month,
        year,
        netSalary: calculated.netSalary,
      },
    });

    await logAudit({
      userId: req.user?._id,
      action: 'CREATE_PAYROLL',
      status: 'SUCCESS',
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.status(201).json({
      success: true,
      message: 'Payroll created successfully',
      data: {
        data: payroll
      },
    });
  } catch (error: any) {
    next(new ErrorResponse(error.message, 500));
  }
};




export const bulkUploadPayroll = async (
  req: TypedRequest<{}, {}, {}>,
  res: TypedResponse<CreateBulkPayrollResponse>,
  next: NextFunction
) => {
  try {
    if (!req.file) {
      return next(new ErrorResponse('No file uploaded.', 400));
    }

    const companyId = req.company?.id;
    const hrUserId = req.user?._id;

    const rows = parseExcelPayroll(req.file.buffer);

    if (!Array.isArray(rows)) {
      return next(new ErrorResponse('Invalid Excel data.', 400));
    }

    const companyStructure = await CompanySalaryStructure.findOne({ company: companyId });
    const taxPercentage = companyStructure?.taxPercentage || 0;

    const created: string[] = [];
    const failed: string[] = [];

    for (const row of rows) {
      const employee = await User.findOne({ email: row.email, company: companyId });

      if (!employee) {
        failed.push(row.email);
        continue;
      }

      const calculated = calculatePayroll({
        basicSalary: row.basicSalary,
        allowances: row.allowances,
        deductions: row.deductions,
        taxPercentage,
      });

      const payroll = await Payroll.create({
        employee: employee._id,
        company: companyId,
        month: row.month,
        year: row.year,
        basicSalary: row.basicSalary,
        allowances: row.allowances,
        deductions: row.deductions,
        grossSalary: calculated.grossSalary,
        totalDeductions: calculated.totalDeductions,
        netSalary: calculated.netSalary,
        tax: calculated.taxAmount,
        status: 'Paid',
        paidDate: new Date(),
        payslipUrl: '',
      });

      await sendNotification({
        user: employee,
        type: 'NEW_PAYROLL',
        title: 'New Payslip Available',
        message: `Your payslip for ${row.month} ${row.year} is now available.`,
        emailSubject: 'New Payslip Available',
        emailTemplate: 'payslip-notification.ejs',
        emailData: {
          name: employee.firstName,
          month: row.month,
          year: row.year,
          netSalary: calculated.netSalary,
        },
      });

      

      created.push(row.email);
    }

    await logAudit({
      userId: hrUserId,
      action: 'BULK_UPLOAD_PAYROLL',
      status: 'SUCCESS',
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.status(200).json({
      success: true,
      message: 'Payroll records processed successfully.',
      data: {
        created,
        failed,
      },
    });
  } catch (error: any) {
    next(new ErrorResponse(error.message, 500));
  }
};


export const getMyPayslips = async (
  req: TypedRequest,
  res: TypedResponse<CreatePayrollResponse>,
  next: NextFunction
) => {
  try {
    const employeeId = req.user?.id;

    if (!employeeId) {
      return next(new ErrorResponse('Unauthorized access', 401));
    }

    // Fetch the latest payslip (single document)
    const payslip = await Payroll.findOne({ employee: employeeId }).sort({ createdAt: -1 });

    if (!payslip) {
      return next(new ErrorResponse('No payslip found.', 404));
    }

    // Return a single payroll in the `data` field
    res.status(200).json({
      success: true,
      data: {
        data: payslip
      },  
    });
  } catch (error: any) {
    next(new ErrorResponse(error.message, 500));
  }
};




type PayrollOverviewQuery = {
  month?: string;
  year?: string;
};

export const getPayrollOverview = async (
  req: TypedRequest<{}, PayrollOverviewQuery, {}>,
  res: TypedResponse<PayrollOverviewResponse>,
  next: NextFunction
) => {
  try {
    const companyId = req.company?.id;

    const { month, year } = req.query;

    const filter: any = { company: companyId };

    if (month) filter.month = month;
    if (year) filter.year = parseInt(year, 10);

    const payrolls = await Payroll.find(filter);

    const totalPayroll = payrolls.reduce((sum, p) => sum + p.netSalary, 0);
    const totalEmployees = payrolls.length;
    const averageSalary = totalEmployees > 0 ? totalPayroll / totalEmployees : 0;
    const totalDeductions = payrolls.reduce(
      (sum, p) => sum + p.tax + p.deductions.reduce((dSum, d) => dSum + d.amount, 0),
      0
    );

    res.status(200).json({
      success: true,
      message: 'Payroll overview retrieved successfully.',
      data: {
        totalPayroll,
        totalEmployees,
        averageSalary,
        totalDeductions,
      },
    });
  } catch (error: any) {
    next(new ErrorResponse(error.message, 500));
  }
};