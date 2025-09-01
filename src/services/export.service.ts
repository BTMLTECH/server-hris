"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExportService = exports.getMonthName = exports.capitalizeWords = exports.formatCurrency = void 0;
const pdfkit_1 = __importDefault(require("pdfkit"));
const exceljs_1 = __importDefault(require("exceljs"));
const axios_1 = __importDefault(require("axios"));
const chartjs_node_canvas_1 = require("chartjs-node-canvas");
const path_1 = __importDefault(require("path"));
const formatCurrency = (amount) => {
    if (!amount || isNaN(amount))
        return "₦0.00";
    return `₦${amount.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`;
};
exports.formatCurrency = formatCurrency;
const capitalizeWords = (str) => {
    if (!str)
        return "N/A";
    return str
        .toLowerCase()
        .split(" ")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
};
exports.capitalizeWords = capitalizeWords;
// ✅ Convert month number to name
const getMonthName = (monthNumber) => {
    const date = new Date(2000, monthNumber - 1);
    return date.toLocaleString("default", { month: "long" });
};
exports.getMonthName = getMonthName;
class ExportService {
    // ------------------- CHART GENERATION --------------------
    static async generateChartImage(type, labels, data, title) {
        const configuration = {
            type,
            data: {
                labels,
                datasets: [
                    {
                        label: title,
                        data,
                        backgroundColor: [
                            "#4CAF50",
                            "#2196F3",
                            "#FFC107",
                            "#FF5722",
                            "#9C27B0",
                            "#E91E63",
                            "#00BCD4",
                            "#8BC34A",
                            "#CDDC39",
                        ],
                    },
                ],
            },
            options: {
                responsive: false,
                plugins: {
                    legend: { position: "bottom" },
                    title: {
                        display: true,
                        text: title,
                        font: { size: 18 },
                    },
                },
            },
        };
        return ExportService.chartJSNodeCanvas.renderToBuffer(configuration);
    }
    static async getCharts(summary) {
        // Employee Summary charts
        if (summary.reportType === "employee_summary" ||
            (!summary.reportType && summary.totalEmployees !== undefined)) {
            const barChart = await this.generateChartImage("bar", ["Total", "New Hires", "Exited"], [summary.totalEmployees, summary.newHires, summary.exitedEmployees], "Employee Overview");
            const pieChart = await this.generateChartImage("pie", ["Average Salary", "Highest Salary", "Lowest Salary"], [summary.avgSalary, summary.highestSalary, summary.lowestSalary], "Salary Distribution");
            return { barChart, pieChart };
        }
        // Department Analysis charts
        if (summary.reportType === "department_analysis" && Array.isArray(summary.data)) {
            const deptLabels = summary.data.map((d) => d.department);
            const deptCounts = summary.data.map((d) => d.totalEmployees);
            const deptAvgSalaries = summary.data.map((d) => d.avgSalary);
            const barChart = await this.generateChartImage("bar", deptLabels, deptCounts, "Employees per Department");
            const pieChart = await this.generateChartImage("pie", deptLabels, deptAvgSalaries, "Average Salary per Department");
            return { barChart, pieChart };
        }
        return { barChart: null, pieChart: null };
    }
    // ------------------- PDF EXPORT --------------------
    static async exportPDF(summary, employees, companyData, res, filename) {
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        const doc = new pdfkit_1.default({ margin: 30 });
        const fontPath = path_1.default.resolve(__dirname, "../assets/fonts/Roboto-Regular.ttf");
        doc.registerFont("Main", fontPath);
        doc.font("Main");
        doc.pipe(res);
        // Company logo / name
        if (companyData?.branding?.logoUrl) {
            try {
                const logoResp = await axios_1.default.get(companyData.branding.logoUrl, {
                    responseType: "arraybuffer",
                });
                doc.image(Buffer.from(logoResp.data, "binary"), { width: 100, align: "center" });
            }
            catch {
                doc.fontSize(18).text(companyData?.name || "", { align: "center" });
            }
        }
        else {
            doc.fontSize(18).text(companyData?.name || "", { align: "center" });
        }
        doc.moveDown(2);
        doc
            .fontSize(22)
            .text(summary.reportType === "department_analysis"
            ? "Department Analysis Report"
            : "Employment Summary Report", { align: "center", underline: true });
        doc.moveDown(1);
        // Summary table
        if (summary.reportType === "department_analysis") {
            doc.fontSize(14).text("Department Data:", { underline: true });
            summary.data.forEach((dept) => {
                doc
                    .fontSize(12)
                    .text(`${dept.department} - Employees: ${dept.totalEmployees}, Avg Salary: ${dept.avgSalary.toFixed(2)}`);
            });
        }
        else {
            doc.fontSize(14).text("Summary:", { underline: true });
            Object.entries(summary).forEach(([key, value]) => {
                if (key !== "reportType")
                    doc.fontSize(12).text(`${key}: ${value}`);
            });
        }
        // Charts
        const { barChart, pieChart } = await this.getCharts(summary);
        if (barChart)
            doc.addPage().image(barChart, { fit: [700, 400], align: "center", valign: "center" });
        if (pieChart)
            doc.addPage().image(pieChart, { fit: [700, 400], align: "center", valign: "center" });
        // Employee list (extended)
        if (summary.reportType !== "department_analysis") {
            doc.addPage();
            doc.fontSize(14).text("Employee List:", { underline: true });
            const headers = [
                "Staff ID",
                "Name",
                "Email",
                "Dept",
                "Position",
                "Branch",
                "Level",
                "Mobile",
                "DOB",
                "Employment Date",
                "Basic Pay",
                "Allowances",
                "Bank",
            ];
            const xPositions = [30, 90, 220, 360, 420, 480, 530, 580, 630, 700, 780, 840, 900];
            const tableTop = doc.y + 15;
            doc.fontSize(8);
            headers.forEach((h, i) => doc.text(h, xPositions[i], tableTop));
            let y = tableTop + 15;
            employees.forEach((emp) => {
                const fullName = `${emp.title || ""} ${emp.firstName} ${emp.middleName || ""} ${emp.lastName}`;
                doc.text(emp.staffId, xPositions[0], y);
                doc.text(fullName.trim(), xPositions[1], y);
                doc.text(emp.email, xPositions[2], y);
                doc.text(emp.department, xPositions[3], y);
                doc.text(emp.position, xPositions[4], y);
                doc.text(emp.officeBranch || "", xPositions[5], y);
                doc.text(emp.level || "", xPositions[6], y);
                doc.text(emp.mobile || "", xPositions[7], y);
                doc.text(emp.dateOfBirth ? new Date(emp.dateOfBirth).toLocaleDateString() : "", xPositions[8], y);
                doc.text(emp.employmentDate ? new Date(emp.employmentDate).toLocaleDateString() : "", xPositions[9], y);
                doc.text(emp.accountInfo?.basicPay?.toFixed(2) || "", xPositions[10], y);
                doc.text(emp.accountInfo?.allowances?.toFixed(2) || "", xPositions[11], y);
                doc.text(emp.accountInfo?.bankName || "", xPositions[12], y);
                y += 15;
            });
        }
        doc.end();
    }
    // ------------------- EXCEL EXPORT --------------------
    static async exportExcel(summary, employees, res, filename) {
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        const workbook = new exceljs_1.default.Workbook();
        // Summary / Data sheet
        if (summary.reportType === "department_analysis") {
            const deptSheet = workbook.addWorksheet("Department Analysis");
            deptSheet.addRow(["Department", "Total Employees", "Average Salary"]);
            summary.data.forEach((d) => deptSheet.addRow([d.department, d.totalEmployees, d.avgSalary]));
        }
        else {
            const summarySheet = workbook.addWorksheet("Summary");
            summarySheet.addRow(["Metric", "Value"]);
            for (const [key, value] of Object.entries(summary)) {
                if (key !== "reportType")
                    summarySheet.addRow([key, value]);
            }
        }
        if (summary.reportType !== "department_analysis") {
            const empSheet = workbook.addWorksheet("Employees");
            empSheet.columns = [
                { header: "Staff ID", key: "staffId", width: 12 },
                { header: "Title", key: "title", width: 8 },
                { header: "First Name", key: "firstName", width: 15 },
                { header: "Middle Name", key: "middleName", width: 15 },
                { header: "Last Name", key: "lastName", width: 15 },
                { header: "Gender", key: "gender", width: 10 },
                { header: "DOB", key: "dateOfBirth", width: 12 },
                { header: "Email", key: "email", width: 25 },
                { header: "Mobile", key: "mobile", width: 15 },
                { header: "Department", key: "department", width: 15 },
                { header: "Position", key: "position", width: 20 },
                { header: "Branch", key: "officeBranch", width: 15 },
                { header: "Level", key: "level", width: 10 },
                { header: "Employment Date", key: "employmentDate", width: 15 },
                { header: "Basic Pay", key: "basicPay", width: 12 },
                { header: "Allowances", key: "allowances", width: 12 },
                { header: "Bank Name", key: "bankName", width: 20 },
                { header: "Account Number", key: "bankAccountNumber", width: 20 },
                { header: "Tax Number", key: "taxNumber", width: 20 },
                { header: "Pension Company", key: "pensionCompany", width: 20 },
                { header: "Pension Number", key: "pensionNumber", width: 20 },
                { header: "Coop Monthly Contribution", key: "coopMonthly", width: 20 },
                { header: "Coop Total", key: "coopTotal", width: 20 },
                { header: "Status", key: "status", width: 15 },
            ];
            employees.forEach((emp) => {
                empSheet.addRow({
                    staffId: emp.staffId,
                    title: emp.title,
                    firstName: emp.firstName,
                    middleName: emp.middleName,
                    lastName: emp.lastName,
                    gender: emp.gender,
                    dateOfBirth: emp.dateOfBirth ? new Date(emp.dateOfBirth).toLocaleDateString() : "",
                    email: emp.email,
                    mobile: emp.mobile,
                    department: emp.department,
                    position: emp.position,
                    officeBranch: emp.officeBranch,
                    level: emp.level,
                    employmentDate: emp.employmentDate ? new Date(emp.employmentDate).toLocaleDateString() : "",
                    basicPay: emp.accountInfo?.basicPay,
                    allowances: emp.accountInfo?.allowances,
                    bankName: emp.accountInfo?.bankName,
                    bankAccountNumber: emp.accountInfo?.bankAccountNumber,
                    taxNumber: emp.accountInfo?.taxNumber,
                    pensionCompany: emp.accountInfo?.pensionCompany,
                    pensionNumber: emp.accountInfo?.pensionNumber,
                    coopMonthly: emp.cooperative?.monthlyContribution,
                    coopTotal: emp.cooperative?.totalContributed,
                    status: emp.status,
                });
            });
        }
        // Charts sheet
        const { barChart, pieChart } = await this.getCharts(summary);
        if (barChart || pieChart) {
            const chartSheet = workbook.addWorksheet("Charts");
            if (barChart) {
                const barImageId = workbook.addImage({ buffer: Buffer.from(barChart), extension: "png" });
                chartSheet.addImage(barImageId, "A1:J20");
            }
            if (pieChart) {
                const pieImageId = workbook.addImage({ buffer: Buffer.from(pieChart), extension: "png" });
                chartSheet.addImage(pieImageId, "A22:J42");
            }
        }
        await workbook.xlsx.write(res);
        res.end();
    }
    static async exportAttendanceExcel(summary, records, res, filename) {
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        const workbook = new exceljs_1.default.Workbook();
        // Summary sheet
        const summarySheet = workbook.addWorksheet("Summary");
        summarySheet.addRow(["Metric", "Value"]);
        for (const [key, value] of Object.entries(summary)) {
            if (key !== "reportType")
                summarySheet.addRow([key, value]);
        }
        // Attendance Records sheet
        const attSheet = workbook.addWorksheet("Attendance");
        attSheet.columns = [
            { header: "Staff ID", key: "staffId", width: 12 },
            { header: "First Name", key: "firstName", width: 15 },
            { header: "Last Name", key: "lastName", width: 15 },
            { header: "Department", key: "department", width: 15 },
            { header: "Date", key: "date", width: 15 },
            { header: "Shift", key: "shift", width: 10 },
            { header: "Check In", key: "checkIn", width: 20 },
            { header: "Check Out", key: "checkOut", width: 20 },
            { header: "Status", key: "status", width: 12 },
            { header: "Hours Worked", key: "hoursWorked", width: 15 },
        ];
        records.forEach((rec) => {
            const user = rec.user;
            attSheet.addRow({
                staffId: user?.staffId || "N/A",
                firstName: user?.firstName || "",
                lastName: user?.lastName || "",
                department: rec.department,
                date: rec.date,
                shift: rec.shift,
                checkIn: rec.checkIn ? new Date(rec.checkIn).toLocaleString() : "",
                checkOut: rec.checkOut ? new Date(rec.checkOut).toLocaleString() : "",
                status: rec.status,
                hoursWorked: rec.hoursWorked ?? 0,
            });
        });
        await workbook.xlsx.write(res);
        res.end();
    }
    static async generatePayrollPDF(arg1, arg2, arg3) {
        // ✅ Capitalize helper
        const capitalizeWords = (str) => {
            if (!str)
                return "";
            return str
                .toLowerCase()
                .split(" ")
                .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                .join(" ");
        };
        return new Promise(async (resolve, reject) => {
            try {
                let companyData;
                let items;
                if (Array.isArray(arg1)) {
                    items = arg1;
                    companyData = arg2;
                }
                else {
                    items = [{ payroll: arg1, employee: arg2 }];
                    companyData = arg3;
                }
                const doc = new pdfkit_1.default({ size: "A4", margin: 50 });
                const chunks = [];
                doc.on("data", (c) => chunks.push(c));
                doc.on("end", () => resolve(Buffer.concat(chunks)));
                doc.on("error", (err) => reject(err));
                const robotoRegular = path_1.default.resolve(process.cwd(), "public/assets/fonts/Roboto-Regular.ttf");
                const robotoBold = path_1.default.resolve(process.cwd(), "public/assets/fonts/Roboto-Bold.ttf");
                doc.registerFont("Roboto", robotoRegular);
                doc.registerFont("Roboto-Bold", robotoBold);
                // Use Roboto by default
                doc.font("Roboto");
                let logoBuffer = null;
                if (companyData?.branding?.logoUrl) {
                    try {
                        const resp = await axios_1.default.get(companyData.branding.logoUrl, { responseType: "arraybuffer" });
                        logoBuffer = Buffer.from(resp.data, "binary");
                    }
                    catch {
                        logoBuffer = null;
                    }
                }
                items.forEach(({ payroll, employee }, index) => {
                    if (index > 0)
                        doc.addPage();
                    if (logoBuffer) {
                        doc.image(logoBuffer, 50, 30, { width: 80 });
                    }
                    else {
                        doc.fontSize(20).text(capitalizeWords(companyData?.name) || "", { align: "center" });
                    }
                    doc.moveDown(0.5);
                    doc.fontSize(16).fillColor("gray").text(capitalizeWords(companyData?.address) || "", { align: "center" });
                    doc.moveDown(1.5);
                    doc.fontSize(18).fillColor("black").text("PAYSLIP", { align: "center", underline: true });
                    doc.moveDown(2);
                    const monthName = (0, exports.getMonthName)(Number(payroll.month));
                    doc.fontSize(12).fillColor("black");
                    const leftX = 50, rightX = 300;
                    let y = doc.y;
                    doc.text(`Name: ${capitalizeWords(employee.firstName)} ${capitalizeWords(employee.lastName)}`, leftX, y);
                    doc.text(`Department: ${capitalizeWords(employee.department) || ""}`, rightX, y);
                    y += 20;
                    doc.text(`Position: ${capitalizeWords(employee.position) || ""}`, leftX, y);
                    doc.text(`Payroll Month: ${capitalizeWords(monthName)} ${payroll.year}`, rightX, y);
                    doc.moveDown(2);
                    // ===== EARNINGS =====
                    doc.fontSize(13).font("Roboto-Bold").text("EARNINGS", leftX, doc.y, { underline: true });
                    doc.moveDown(0.5);
                    const labelX = 70, valueX = 450;
                    doc.font("Roboto").fontSize(12);
                    doc.text("Basic Salary", labelX, doc.y);
                    doc.text((0, exports.formatCurrency)(payroll.basicSalary), valueX, doc.y, { align: "right" });
                    doc.moveDown(0.5);
                    doc.text("Allowances", labelX, doc.y);
                    doc.text((0, exports.formatCurrency)(payroll.totalAllowances), valueX, doc.y, { align: "right" });
                    doc.moveDown(0.5);
                    doc.font("Roboto-Bold").text("Gross Salary", labelX, doc.y);
                    doc.text((0, exports.formatCurrency)(payroll.grossSalary), valueX, doc.y, { align: "right" });
                    doc.font("Roboto");
                    doc.moveDown(2);
                    // ===== DEDUCTIONS =====
                    doc.fontSize(13).font("Roboto-Bold").text("DEDUCTIONS", leftX, doc.y, { underline: true });
                    doc.moveDown(0.5);
                    doc.font("Roboto").text("Pension", labelX, doc.y);
                    doc.text((0, exports.formatCurrency)(payroll.pension), valueX, doc.y, { align: "right" });
                    doc.moveDown(0.5);
                    doc.text("Tax", labelX, doc.y);
                    doc.text((0, exports.formatCurrency)(payroll.tax), valueX, doc.y, { align: "right" });
                    doc.moveDown(2);
                    // ===== NET SALARY =====
                    doc.fontSize(16).font("Roboto-Bold").fillColor("green").text("Net Salary", labelX, doc.y);
                    doc.text((0, exports.formatCurrency)(payroll.netSalary), valueX, doc.y, { align: "right" });
                    doc.moveDown(4);
                    doc.fontSize(10).fillColor("gray").font("Roboto").text("This is a system-generated payslip.", { align: "center" });
                });
                doc.end();
            }
            catch (err) {
                reject(err);
            }
        });
    }
    static async generatePayrollExcel(arg1, arg2, arg3) {
        // ✅ Capitalize helper
        const capitalizeWords = (str) => {
            if (!str)
                return "";
            return str
                .toLowerCase()
                .split(" ")
                .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                .join(" ");
        };
        // Normalize args
        let companyData;
        let items;
        if (Array.isArray(arg1)) {
            items = arg1;
            companyData = arg2;
        }
        else {
            items = [{ payroll: arg1, employee: arg2 }];
            companyData = arg3;
        }
        const workbook = new exceljs_1.default.Workbook();
        if (items.length === 1) {
            const sheet = workbook.addWorksheet("Payroll Slip");
            sheet.columns = [
                { header: "Field", key: "field", width: 30 },
                { header: "Value", key: "value", width: 30 },
            ];
            sheet.getRow(1).font = { bold: true, size: 12, color: { argb: "FFFFFFFF" } };
            sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2F75B5" } };
            const { payroll, employee } = items[0];
            const monthName = (0, exports.getMonthName)(Number(payroll.month));
            sheet.addRow(["Company", capitalizeWords(companyData?.name) || ""]);
            sheet.addRow(["Payroll Month", `${capitalizeWords(monthName)} ${payroll.year}`]);
            sheet.addRow([]);
            sheet.addRow(["Employee Details", ""]);
            sheet.lastRow.font = { bold: true };
            sheet.addRow(["Name", `${capitalizeWords(employee.firstName)} ${capitalizeWords(employee.lastName)}`]);
            sheet.addRow(["Department", capitalizeWords(employee.department) || ""]);
            sheet.addRow(["Position", capitalizeWords(employee.position) || ""]);
            sheet.addRow([]);
            sheet.addRow(["Earnings", ""]);
            sheet.lastRow.font = { bold: true };
            sheet.addRow(["Basic Salary", (0, exports.formatCurrency)(payroll.basicSalary)]);
            sheet.addRow(["Allowances", (0, exports.formatCurrency)(payroll.totalAllowances)]);
            sheet.addRow(["Gross Salary", (0, exports.formatCurrency)(payroll.grossSalary)]);
            sheet.addRow([]);
            sheet.addRow(["Deductions", ""]);
            sheet.lastRow.font = { bold: true };
            sheet.addRow(["Pension", (0, exports.formatCurrency)(payroll.pension)]);
            sheet.addRow(["Tax", (0, exports.formatCurrency)(payroll.tax)]);
            sheet.addRow([]);
            sheet.addRow(["Net Salary", (0, exports.formatCurrency)(payroll.netSalary)]);
            sheet.lastRow.font = { bold: true, color: { argb: "FF228B22" } };
        }
        else {
            const sheet = workbook.addWorksheet("Payroll (Bulk)");
            sheet.columns = [
                { header: "Employee", key: "employee", width: 28 },
                { header: "Department", key: "department", width: 20 },
                { header: "Position", key: "position", width: 22 },
                { header: "Payroll Month", key: "payrollMonth", width: 18 },
                { header: "Basic Salary", key: "basicSalary", width: 18 },
                { header: "Allowances", key: "allowances", width: 18 },
                { header: "Gross Salary", key: "grossSalary", width: 18 },
                { header: "Pension", key: "pension", width: 16 },
                { header: "Tax", key: "tax", width: 16 },
                { header: "Net Salary", key: "netSalary", width: 18 },
            ];
            sheet.getRow(1).font = { bold: true, size: 12, color: { argb: "FFFFFFFF" } };
            sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2F75B5" } };
            items.forEach(({ payroll, employee }) => {
                const monthName = (0, exports.getMonthName)(Number(payroll.month));
                sheet.addRow({
                    employee: `${capitalizeWords(employee.firstName)} ${capitalizeWords(employee.lastName)}`,
                    department: capitalizeWords(employee.department) || "",
                    position: capitalizeWords(employee.position) || "",
                    payrollMonth: `${capitalizeWords(monthName)} ${payroll.year}`,
                    basicSalary: (0, exports.formatCurrency)(payroll.basicSalary),
                    allowances: (0, exports.formatCurrency)(payroll.totalAllowances),
                    grossSalary: (0, exports.formatCurrency)(payroll.grossSalary),
                    pension: (0, exports.formatCurrency)(payroll.pension),
                    tax: (0, exports.formatCurrency)(payroll.tax),
                    netSalary: (0, exports.formatCurrency)(payroll.netSalary),
                });
            });
        }
        const buffer = await workbook.xlsx.writeBuffer();
        return Buffer.from(buffer);
    }
    static async exportPayrollExcel(summary, payrolls, res, filename) {
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        const workbook = new exceljs_1.default.Workbook();
        // Summary sheet
        const summarySheet = workbook.addWorksheet("Summary");
        summarySheet.addRow(["Metric", "Value"]);
        for (const [key, value] of Object.entries(summary)) {
            if (key !== "reportType")
                summarySheet.addRow([key, value]);
        }
        // Payroll sheet
        const payrollSheet = workbook.addWorksheet("Payroll");
        payrollSheet.columns = [
            { header: "Staff ID", key: "staffId", width: 12 },
            { header: "First Name", key: "firstName", width: 15 },
            { header: "Last Name", key: "lastName", width: 15 },
            { header: "Department", key: "department", width: 15 },
            { header: "Class Level", key: "classLevel", width: 12 },
            { header: "Basic Salary", key: "basicSalary", width: 12 },
            { header: "Total Allowances", key: "totalAllowances", width: 15 },
            { header: "Gross Salary", key: "grossSalary", width: 12 },
            { header: "Pension", key: "pension", width: 12 },
            { header: "CRA", key: "CRA", width: 12 },
            { header: "Taxable Income", key: "taxableIncome", width: 15 },
            { header: "Tax", key: "tax", width: 12 },
            { header: "Net Salary", key: "netSalary", width: 12 },
            { header: "Month", key: "month", width: 10 },
            { header: "Year", key: "year", width: 10 },
            { header: "Status", key: "status", width: 12 },
        ];
        payrolls.forEach((p) => {
            const user = p.user;
            payrollSheet.addRow({
                staffId: user.staffId,
                firstName: user.firstName,
                lastName: user.lastName,
                department: user.department,
                classLevel: p.classLevel,
                basicSalary: p.basicSalary,
                totalAllowances: p.totalAllowances,
                grossSalary: p.grossSalary,
                pension: p.pension,
                CRA: p.CRA,
                taxableIncome: p.taxableIncome,
                tax: p.tax,
                netSalary: p.netSalary,
                month: p.month,
                year: p.year,
                status: p.status,
            });
        });
        await workbook.xlsx.write(res);
        res.end();
    }
}
exports.ExportService = ExportService;
ExportService.chartJSNodeCanvas = new chartjs_node_canvas_1.ChartJSNodeCanvas({ width: 900, height: 500 });
