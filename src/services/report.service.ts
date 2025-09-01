

import User, { IUser } from '../models/user.model';
import Report from '../models/Report';
import Company from '../models/Company';
import { GenerateReportDTO } from '../types/dto/report.dto';
import { NextFunction, Response } from 'express';
import ErrorResponse from '../utils/ErrorResponse';
import { ExportService } from './export.service';
import Attendance, { IAttendance } from '../models/Attendance';
import PayrollNew, { IPayroll } from '../models/PayrollNew';



export class ReportService {
  async generateReport(dto: GenerateReportDTO, res: Response, next: NextFunction) {
    try {
      switch (dto.reportType) {
        case 'employee_summary':
          return this.generateEmploymentSummary(dto, res, next);

        case 'department_analysis':
          return this.generateDepartmentAnalysis(dto, res, next);
          
          case 'attendance_report':
            return this.generateAttendanceReport(dto, res, next);
            
            case 'payroll_summary':            
              return this.generatePayrollSummary(dto, res, next);

        case 'performance_metrics':
          return next(new ErrorResponse('Performance metrics report not implemented yet.', 400));

        default:
          return next(new ErrorResponse(`Unsupported report type: ${dto.reportType}`, 400));
      }
    } catch (err) {
      return next(err);
    }
  }

  private async generateEmploymentSummary(dto: GenerateReportDTO, res: Response, next: NextFunction) {
    const { startDate, endDate, dateRange, department, exportFormat, company } = dto;
    let from = startDate ? new Date(startDate) : undefined;
    let to = endDate ? new Date(endDate) : undefined;
    const today = new Date();

    if (dateRange !== 'custom') {
      switch (dateRange) {
        case 'last_7_days': from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 7); to = new Date(); break;
        case 'last_30_days': from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 30); to = new Date(); break;
        case 'last_quarter': from = new Date(today.getFullYear(), today.getMonth() - 3, today.getDate()); to = new Date(); break;
        case 'last_year': from = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate()); to = new Date(); break;
      }
    }

    if (!from || !to) return next(new ErrorResponse('startDate and endDate required for custom range.', 403));

    const companyData = await Company.findById(company).lean();
    const userFilter: any = { createdAt: { $gte: from, $lte: to } };
    if (department && department !== 'all') userFilter.department = department;

    const employees = await User.find(userFilter).lean();
    const payrolls = await PayrollNew.find({ employee: { $in: employees.map(e => e._id) }, createdAt: { $gte: from, $lte: to } }).lean();

    const totalEmployees = employees.length;
    const newHires = employees.filter(e => e.createdAt >= from && e.createdAt <= to).length;
    const exitedEmployees = employees.filter(e => e.terminationDate && e.terminationDate >= from && e.terminationDate <= to).length;

    const salaries = payrolls.map((p: { netSalary: any; }) => p.netSalary);
    const avgSalary = salaries.length ? salaries.reduce((a: any, b: any) => a + b, 0) / salaries.length : 0;
    const highestSalary = salaries.length ? Math.max(...salaries) : 0;
    const lowestSalary = salaries.length ? Math.min(...salaries) : 0;
    const totalPayroll = salaries.reduce((a: any, b: any) => a + b, 0);

    const summary = {
      company: companyData?.name || '',
      dateRange: `${from.toDateString()} - ${to.toDateString()}`,
      totalEmployees,
      newHires,
      exitedEmployees,
      avgSalary,
      highestSalary,
      lowestSalary,
      totalPayroll
    };

    await Report.create({ ...dto, startDate: from, endDate: to, createdAt: new Date() });

    const monthYear = today.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }).replace(/ /g, '_');
    const filename = `Employment_Summary_${monthYear}.${exportFormat}`;

    if (exportFormat === 'pdf') return ExportService.exportPDF(summary, employees, companyData, res, filename);
    if (exportFormat === 'excel') return ExportService.exportExcel(summary, employees, res, filename);
    // if (exportFormat === 'csv') return ExportService.exportCSV(summary, employees, res, filename);

    return res.json({ summary, employees });
  }

  private async generateDepartmentAnalysis(dto: GenerateReportDTO, res: Response, next: NextFunction) {
    const { startDate, endDate, dateRange, exportFormat, company } = dto;
    let from = startDate ? new Date(startDate) : undefined;
    let to = endDate ? new Date(endDate) : undefined;
    const today = new Date();

    if (dateRange !== 'custom') {
      switch (dateRange) {
        case 'last_7_days': from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 7); to = new Date(); break;
        case 'last_30_days': from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 30); to = new Date(); break;
        case 'last_quarter': from = new Date(today.getFullYear(), today.getMonth() - 3, today.getDate()); to = new Date(); break;
        case 'last_year': from = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate()); to = new Date(); break;
      }
    }

    if (!from || !to) return next(new ErrorResponse('startDate and endDate required for custom range.', 403));

    const companyData = await Company.findById(company).lean();

    const employees = await User.find({ createdAt: { $gte: from, $lte: to } }).lean();
    const payrolls = await PayrollNew.find({ employee: { $in: employees.map(e => e._id) }, createdAt: { $gte: from, $lte: to } }).lean();

    // Group by department
    const deptMap: Record<string, { count: number; salaries: number[] }> = {};
    employees.forEach(emp => {
      const dept = emp.department || 'Unassigned';
      if (!deptMap[dept]) deptMap[dept] = { count: 0, salaries: [] };
      deptMap[dept].count++;
    });

    payrolls.forEach((pay: any) => {
      const emp = employees.find(e => String(e._id) === String(pay.employee));
      if (emp) deptMap[emp.department || 'Unassigned'].salaries.push(pay.netSalary);
    });

    const deptSummary = Object.keys(deptMap).map(dept => ({
      department: dept,
      totalEmployees: deptMap[dept].count,
      avgSalary: deptMap[dept].salaries.length
        ? deptMap[dept].salaries.reduce((a, b) => a + b, 0) / deptMap[dept].salaries.length
        : 0
    }));

    await Report.create({ ...dto, startDate: from, endDate: to, createdAt: new Date() });

    const monthYear = today.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }).replace(/ /g, '_');
    const filename = `Department_Analysis_${monthYear}.${exportFormat}`;

    if (exportFormat === 'pdf') return ExportService.exportPDF({ reportType: 'department_analysis', data: deptSummary }, employees, companyData, res, filename);
    if (exportFormat === 'excel') return ExportService.exportExcel({ reportType: 'department_analysis', data: deptSummary }, employees, res, filename);
    // if (exportFormat === 'csv') return ExportService.exportCSV({ reportType: 'department_analysis', data: deptSummary }, employees, res, filename);

    return res.json({ deptSummary, employees });
  }

  // controllers/report.controller.ts
private async generateAttendanceReport(
  dto: GenerateReportDTO,
  res: Response,
  next: NextFunction
) {
  try {
    const { startDate, endDate, dateRange, department, exportFormat, company } = dto;
    const today = new Date();

    let from = startDate ? new Date(startDate) : undefined;
    let to = endDate ? new Date(endDate) : undefined;

    // Predefined ranges
    if (dateRange !== "custom" && dateRange !== "daily") {
      switch (dateRange) {
        case "last_7_days":
          from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 7);
          to = new Date();
          break;
        case "last_30_days":
          from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 30);
          to = new Date();
          break;
        case "last_quarter":
          from = new Date(today.getFullYear(), today.getMonth() - 3, today.getDate());
          to = new Date();
          break;
        case "last_year":
          from = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());
          to = new Date();
          break;
      }
    }

    // Daily report
    if (dateRange === "daily") {
      if (!startDate) return next(new ErrorResponse("startDate required for daily report.", 403));
      from = new Date(startDate);
      from.setHours(0, 0, 0, 0);
      to = new Date(startDate);
      to.setHours(23, 59, 59, 999);
    }

    if (!from || !to) return next(new ErrorResponse("startDate and endDate required for custom range.", 403));

    const companyData = await Company.findById(company).lean();

    // Attendance filter
    const filter: any = {
      company,
      createdAt: { $gte: from, $lte: to }
    };
    if (department && department !== "all") filter.department = department;

    // Fetch records
    const rawRecords = await Attendance.find(filter)
      .populate("user") // populate IUser details
      .lean();

    // Assert that user exists and map to correct type
    const records: (IAttendance & { user: IUser })[] = rawRecords.map(rec => {
      if (!rec.user) {
        throw new Error("Attendance record missing populated user");
      }
      return rec as IAttendance & { user: IUser };
    });

    // Summary
    const totalRecords = records.length;
    const presentCount = records.filter(r => r.status === "present").length;
    const lateCount = records.filter(r => r.status === "late").length;
    const absentCount = records.filter(r => r.status === "absent").length;
    const leaveCount = records.filter(r => r.status === "on_leave").length;

    const totalHours = records.reduce((sum, r) => sum + (r.hoursWorked || 0), 0);
    const avgHours = totalRecords ? totalHours / totalRecords : 0;

    const summary = {
      reportType: "attendance_report",
      company: companyData?.name || "",
      dateRange: dateRange === "daily" ? from.toDateString() : `${from.toDateString()} - ${to.toDateString()}`,
      totalRecords,
      presentCount,
      lateCount,
      absentCount,
      leaveCount,
      totalHours,
      avgHours: avgHours.toFixed(2)
    };

    // Save report metadata
    await Report.create({ ...dto, startDate: from, endDate: to, createdAt: new Date() });

    // Filename
    const rangeLabel = dateRange === "daily"
      ? from.toISOString().split("T")[0]
      : today.toLocaleDateString("en-GB", { month: "long", year: "numeric" }).replace(/ /g, "_");

    const filename = `Attendance_Report_${rangeLabel}.${exportFormat}`;

    // Export
    if (exportFormat === "excel") {
      return ExportService.exportAttendanceExcel(summary, records, res, filename);
    }

    // Fallback JSON
    return res.json({ summary, records });

  } catch (error) {
    next(error);
  }
}

 private async generatePayrollSummary(
    dto: GenerateReportDTO,
    res: Response,
    next: NextFunction
  ) {
    try {
      const { startDate, endDate, dateRange, department, exportFormat, company } = dto;
      const today = new Date();

      let from = startDate ? new Date(startDate) : undefined;
      let to = endDate ? new Date(endDate) : undefined;

      // Predefined ranges
      if (dateRange !== "custom") {
        switch (dateRange) {
          case "last_7_days":
            from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 7);
            to = new Date();
            break;
          case "last_30_days":
            from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 30);
            to = new Date();
            break;
          case "last_quarter":
            from = new Date(today.getFullYear(), today.getMonth() - 3, today.getDate());
            to = new Date();
            break;
          case "last_year":
            from = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());
            to = new Date();
            break;
        }
      }

      if (!from || !to) return next(new ErrorResponse("startDate and endDate required for custom range.", 403));

      const companyData = await Company.findById(company).lean();

      // Fetch payrolls
      const rawPayrolls = await PayrollNew.find({
        company,
        createdAt: { $gte: from, $lte: to },
      })
        .populate("user")
        .lean();
      const payrolls = rawPayrolls.map((p: any) => {
        if (!p.user) throw new Error("Payroll missing user info");
        return p as unknown as IPayroll & { user: IUser };
      })

      // Filter by department if needed
      const filteredPayrolls = department && department !== "all"
        ? payrolls.filter((p: { user: IUser; }) => (p.user as IUser).department === department)
        : payrolls;

      // Summary calculations
      const totalEmployees = filteredPayrolls.length;
      const totalGross = filteredPayrolls.reduce((sum: any, p: { grossSalary: any; }) => sum + p.grossSalary, 0);
      const totalNet = filteredPayrolls.reduce((sum: any, p: { netSalary: any; }) => sum + p.netSalary, 0);
      const avgGross = totalEmployees ? totalGross / totalEmployees : 0;
      const avgNet = totalEmployees ? totalNet / totalEmployees : 0;

      const summary = {
        reportType: "payroll_summary",
        company: companyData?.name || "",
        dateRange: `${from.toDateString()} - ${to.toDateString()}`,
        totalEmployees,
        totalGross,
        totalNet,
        avgGross: avgGross.toFixed(2),
        avgNet: avgNet.toFixed(2),
      };

      // Save report metadata
      await Report.create({ ...dto, startDate: from, endDate: to, createdAt: new Date() });

      const filename = `Payroll_Summary_${today.toLocaleDateString("en-GB").replace(/\//g, "_")}.${exportFormat}`;

      // Export
      if (exportFormat === "excel") {
        return ExportService.exportPayrollExcel(summary, filteredPayrolls, res, filename);
      }

      // fallback JSON
      return res.json({ summary, payrolls: filteredPayrolls });

    } catch (error) {
      next(error);
    }
  }

}
