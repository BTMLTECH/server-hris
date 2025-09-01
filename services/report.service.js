"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReportService = void 0;
const user_model_1 = __importDefault(require("../models/user.model"));
const Report_1 = __importDefault(require("../models/Report"));
const Company_1 = __importDefault(require("../models/Company"));
const ErrorResponse_1 = __importDefault(require("../utils/ErrorResponse"));
const export_service_1 = require("./export.service");
const Attendance_1 = __importDefault(require("../models/Attendance"));
const PayrollNew_1 = __importDefault(require("../models/PayrollNew"));
class ReportService {
    async generateReport(dto, res, next) {
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
                    return next(new ErrorResponse_1.default('Performance metrics report not implemented yet.', 400));
                default:
                    return next(new ErrorResponse_1.default(`Unsupported report type: ${dto.reportType}`, 400));
            }
        }
        catch (err) {
            return next(err);
        }
    }
    async generateEmploymentSummary(dto, res, next) {
        const { startDate, endDate, dateRange, department, exportFormat, company } = dto;
        let from = startDate ? new Date(startDate) : undefined;
        let to = endDate ? new Date(endDate) : undefined;
        const today = new Date();
        if (dateRange !== 'custom') {
            switch (dateRange) {
                case 'last_7_days':
                    from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 7);
                    to = new Date();
                    break;
                case 'last_30_days':
                    from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 30);
                    to = new Date();
                    break;
                case 'last_quarter':
                    from = new Date(today.getFullYear(), today.getMonth() - 3, today.getDate());
                    to = new Date();
                    break;
                case 'last_year':
                    from = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());
                    to = new Date();
                    break;
            }
        }
        if (!from || !to)
            return next(new ErrorResponse_1.default('startDate and endDate required for custom range.', 403));
        const companyData = await Company_1.default.findById(company).lean();
        const userFilter = { createdAt: { $gte: from, $lte: to } };
        if (department && department !== 'all')
            userFilter.department = department;
        const employees = await user_model_1.default.find(userFilter).lean();
        const payrolls = await PayrollNew_1.default.find({ employee: { $in: employees.map(e => e._id) }, createdAt: { $gte: from, $lte: to } }).lean();
        const totalEmployees = employees.length;
        const newHires = employees.filter(e => e.createdAt >= from && e.createdAt <= to).length;
        const exitedEmployees = employees.filter(e => e.terminationDate && e.terminationDate >= from && e.terminationDate <= to).length;
        const salaries = payrolls.map((p) => p.netSalary);
        const avgSalary = salaries.length ? salaries.reduce((a, b) => a + b, 0) / salaries.length : 0;
        const highestSalary = salaries.length ? Math.max(...salaries) : 0;
        const lowestSalary = salaries.length ? Math.min(...salaries) : 0;
        const totalPayroll = salaries.reduce((a, b) => a + b, 0);
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
        await Report_1.default.create({ ...dto, startDate: from, endDate: to, createdAt: new Date() });
        const monthYear = today.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }).replace(/ /g, '_');
        const filename = `Employment_Summary_${monthYear}.${exportFormat}`;
        if (exportFormat === 'pdf')
            return export_service_1.ExportService.exportPDF(summary, employees, companyData, res, filename);
        if (exportFormat === 'excel')
            return export_service_1.ExportService.exportExcel(summary, employees, res, filename);
        // if (exportFormat === 'csv') return ExportService.exportCSV(summary, employees, res, filename);
        return res.json({ summary, employees });
    }
    async generateDepartmentAnalysis(dto, res, next) {
        const { startDate, endDate, dateRange, exportFormat, company } = dto;
        let from = startDate ? new Date(startDate) : undefined;
        let to = endDate ? new Date(endDate) : undefined;
        const today = new Date();
        if (dateRange !== 'custom') {
            switch (dateRange) {
                case 'last_7_days':
                    from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 7);
                    to = new Date();
                    break;
                case 'last_30_days':
                    from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 30);
                    to = new Date();
                    break;
                case 'last_quarter':
                    from = new Date(today.getFullYear(), today.getMonth() - 3, today.getDate());
                    to = new Date();
                    break;
                case 'last_year':
                    from = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());
                    to = new Date();
                    break;
            }
        }
        if (!from || !to)
            return next(new ErrorResponse_1.default('startDate and endDate required for custom range.', 403));
        const companyData = await Company_1.default.findById(company).lean();
        const employees = await user_model_1.default.find({ createdAt: { $gte: from, $lte: to } }).lean();
        const payrolls = await PayrollNew_1.default.find({ employee: { $in: employees.map(e => e._id) }, createdAt: { $gte: from, $lte: to } }).lean();
        // Group by department
        const deptMap = {};
        employees.forEach(emp => {
            const dept = emp.department || 'Unassigned';
            if (!deptMap[dept])
                deptMap[dept] = { count: 0, salaries: [] };
            deptMap[dept].count++;
        });
        payrolls.forEach((pay) => {
            const emp = employees.find(e => String(e._id) === String(pay.employee));
            if (emp)
                deptMap[emp.department || 'Unassigned'].salaries.push(pay.netSalary);
        });
        const deptSummary = Object.keys(deptMap).map(dept => ({
            department: dept,
            totalEmployees: deptMap[dept].count,
            avgSalary: deptMap[dept].salaries.length
                ? deptMap[dept].salaries.reduce((a, b) => a + b, 0) / deptMap[dept].salaries.length
                : 0
        }));
        await Report_1.default.create({ ...dto, startDate: from, endDate: to, createdAt: new Date() });
        const monthYear = today.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }).replace(/ /g, '_');
        const filename = `Department_Analysis_${monthYear}.${exportFormat}`;
        if (exportFormat === 'pdf')
            return export_service_1.ExportService.exportPDF({ reportType: 'department_analysis', data: deptSummary }, employees, companyData, res, filename);
        if (exportFormat === 'excel')
            return export_service_1.ExportService.exportExcel({ reportType: 'department_analysis', data: deptSummary }, employees, res, filename);
        // if (exportFormat === 'csv') return ExportService.exportCSV({ reportType: 'department_analysis', data: deptSummary }, employees, res, filename);
        return res.json({ deptSummary, employees });
    }
    // controllers/report.controller.ts
    async generateAttendanceReport(dto, res, next) {
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
                if (!startDate)
                    return next(new ErrorResponse_1.default("startDate required for daily report.", 403));
                from = new Date(startDate);
                from.setHours(0, 0, 0, 0);
                to = new Date(startDate);
                to.setHours(23, 59, 59, 999);
            }
            if (!from || !to)
                return next(new ErrorResponse_1.default("startDate and endDate required for custom range.", 403));
            const companyData = await Company_1.default.findById(company).lean();
            // Attendance filter
            const filter = {
                company,
                createdAt: { $gte: from, $lte: to }
            };
            if (department && department !== "all")
                filter.department = department;
            // Fetch records
            const rawRecords = await Attendance_1.default.find(filter)
                .populate("user") // populate IUser details
                .lean();
            // Assert that user exists and map to correct type
            const records = rawRecords.map(rec => {
                if (!rec.user) {
                    throw new Error("Attendance record missing populated user");
                }
                return rec;
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
            await Report_1.default.create({ ...dto, startDate: from, endDate: to, createdAt: new Date() });
            // Filename
            const rangeLabel = dateRange === "daily"
                ? from.toISOString().split("T")[0]
                : today.toLocaleDateString("en-GB", { month: "long", year: "numeric" }).replace(/ /g, "_");
            const filename = `Attendance_Report_${rangeLabel}.${exportFormat}`;
            // Export
            if (exportFormat === "excel") {
                return export_service_1.ExportService.exportAttendanceExcel(summary, records, res, filename);
            }
            // Fallback JSON
            return res.json({ summary, records });
        }
        catch (error) {
            next(error);
        }
    }
    async generatePayrollSummary(dto, res, next) {
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
            if (!from || !to)
                return next(new ErrorResponse_1.default("startDate and endDate required for custom range.", 403));
            const companyData = await Company_1.default.findById(company).lean();
            // Fetch payrolls
            const rawPayrolls = await PayrollNew_1.default.find({
                company,
                createdAt: { $gte: from, $lte: to },
            })
                .populate("user")
                .lean();
            const payrolls = rawPayrolls.map((p) => {
                if (!p.user)
                    throw new Error("Payroll missing user info");
                return p;
            });
            // Filter by department if needed
            const filteredPayrolls = department && department !== "all"
                ? payrolls.filter((p) => p.user.department === department)
                : payrolls;
            // Summary calculations
            const totalEmployees = filteredPayrolls.length;
            const totalGross = filteredPayrolls.reduce((sum, p) => sum + p.grossSalary, 0);
            const totalNet = filteredPayrolls.reduce((sum, p) => sum + p.netSalary, 0);
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
            await Report_1.default.create({ ...dto, startDate: from, endDate: to, createdAt: new Date() });
            const filename = `Payroll_Summary_${today.toLocaleDateString("en-GB").replace(/\//g, "_")}.${exportFormat}`;
            // Export
            if (exportFormat === "excel") {
                return export_service_1.ExportService.exportPayrollExcel(summary, filteredPayrolls, res, filename);
            }
            // fallback JSON
            return res.json({ summary, payrolls: filteredPayrolls });
        }
        catch (error) {
            next(error);
        }
    }
}
exports.ReportService = ReportService;
