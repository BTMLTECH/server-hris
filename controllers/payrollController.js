"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.processBulkPayroll = exports.reverseBulkPayroll = exports.markPayrollsAsDraftBulk = exports.markPayrollsAsPaidBulk = exports.markPayrollAsPaid = exports.processSinglePayroll = exports.reverseSinglePayroll = exports.markPayrollAsDraft = exports.deletePayroll = exports.getAllPayrolls = void 0;
const asyncHandler_1 = require("../middleware/asyncHandler");
const PayrollNew_1 = __importDefault(require("../models/PayrollNew"));
const TaxInfo_1 = __importDefault(require("../models/TaxInfo"));
const ErrorResponse_1 = __importDefault(require("../utils/ErrorResponse"));
const logAudit_1 = require("../utils/logAudit");
const sendNotification_1 = require("../utils/sendNotification");
const user_model_1 = __importDefault(require("../models/user.model"));
const mongoose_1 = __importDefault(require("mongoose"));
const export_service_1 = require("../services/export.service");
const cloudinary_1 = require("../utils/cloudinary");
const p_limit_1 = __importDefault(require("p-limit"));
exports.getAllPayrolls = (0, asyncHandler_1.asyncHandler)(async (req, res, next) => {
    const user = req.user;
    const company = req.company;
    if (!user || !company) {
        return next(new ErrorResponse_1.default("Unauthorized or no company context", 401));
    }
    const { page = "1", limit = "100", sort = "desc", employee, month, year, search, } = req.query;
    const pageNum = Math.max(Number(page), 1);
    const limitNum = Math.min(Math.max(Number(limit), 1), 100);
    const skip = (pageNum - 1) * limitNum;
    // 🔒 Build match filter
    const matchStage = { company: company._id };
    if (user.role !== "admin" && user.role !== "hr") {
        // Employees only see their own payrolls AND only if status is paid
        matchStage.user = user._id;
        matchStage.status = "paid";
    }
    else if (employee) {
        matchStage.user = new mongoose_1.default.Types.ObjectId(employee);
    }
    if (month)
        matchStage.month = Number(month);
    if (year)
        matchStage.year = Number(year);
    // 🔍 Aggregation pipeline
    const pipeline = [
        { $match: matchStage },
        {
            $lookup: {
                from: "users",
                localField: "user",
                foreignField: "_id",
                as: "user",
            },
        },
        { $unwind: "$user" },
        {
            $lookup: {
                from: "companies",
                localField: "company",
                foreignField: "_id",
                as: "company",
            },
        },
        { $unwind: "$company" },
    ];
    if (search) {
        const searchRegex = new RegExp(search.trim(), "i");
        pipeline.push({
            $match: {
                $or: [{ "user.firstName": searchRegex }, { "user.lastName": searchRegex }],
            },
        });
    }
    pipeline.push({
        $sort: {
            year: sort === "asc" ? 1 : -1,
            month: sort === "asc" ? 1 : -1,
        },
    }, {
        $facet: {
            data: [{ $skip: skip }, { $limit: limitNum }],
            totalCount: [{ $count: "count" }],
        },
    });
    // 👤 Fetch payrolls
    const results = await PayrollNew_1.default.aggregate(pipeline);
    const payrolls = results[0]?.data || [];
    const total = results[0]?.totalCount[0]?.count || 0;
    // 🔎 Fetch tax info
    const payrollIds = payrolls.map((p) => p._id);
    const taxInfos = await TaxInfo_1.default.find({
        payrollId: { $in: payrollIds },
    }).lean();
    const taxInfoMap = new Map(taxInfos.map((t) => [t.payrollId.toString(), t]));
    const enrichedPayrolls = payrolls.map((p) => ({
        ...p,
        taxInfo: taxInfoMap.get(p._id.toString()) || null,
    }));
    // 📝 Audit log
    await (0, logAudit_1.logAudit)({
        userId: user._id,
        action: "GET_ALL_PAYROLLS",
        status: "SUCCESS",
        ip: req.ip,
        userAgent: req.get("user-agent"),
    });
    // 📤 Response
    res.status(200).json({
        success: true,
        message: "Payrolls fetched successfully",
        data: {
            count: enrichedPayrolls.length,
            data: enrichedPayrolls,
            pagination: {
                total,
                page: pageNum,
                limit: limitNum,
                pages: Math.ceil(total / limitNum),
            },
        },
    });
});
exports.deletePayroll = (0, asyncHandler_1.asyncHandler)(async (req, res, next) => {
    const payrollId = req.params.id;
    const payroll = await PayrollNew_1.default.findById(payrollId);
    if (!payroll) {
        return next(new ErrorResponse_1.default('Payroll not found', 404));
    }
    // Delete TaxInfo
    await TaxInfo_1.default.findOneAndDelete({ payrollId });
    // Delete Payroll
    await PayrollNew_1.default.findByIdAndDelete(payrollId);
    // Log audit
    await (0, logAudit_1.logAudit)({
        userId: req.user?._id,
        action: 'DELETE_PAYROLL',
        status: 'SUCCESS',
        ip: req.ip,
        userAgent: req.get('user-agent') || '',
    });
    res.status(200).json({
        success: true,
        message: 'Payroll deleted successfully',
    });
});
exports.markPayrollAsDraft = (0, asyncHandler_1.asyncHandler)(async (req, res, next) => {
    const { payrollId } = req.params;
    const company = req.company;
    const companyId = company?._id;
    const userId = req.user?._id;
    if (!companyId)
        return next(new ErrorResponse_1.default("Company not found", 404));
    const payroll = await PayrollNew_1.default.findById(payrollId).populate("user");
    if (!payroll)
        return next(new ErrorResponse_1.default("Payroll not found", 404));
    if (payroll.company.toString() !== companyId.toString()) {
        return next(new ErrorResponse_1.default("Payroll does not belong to your company", 403));
    }
    if (payroll.status === "draft") {
        return next(new ErrorResponse_1.default("Payroll is already in draft status", 400));
    }
    const employee = payroll.user;
    payroll.status = "draft";
    await payroll.save();
    await (0, logAudit_1.logAudit)({
        userId,
        action: "MARK_PAYROLL_AS_DRAFT",
        status: "SUCCESS",
        ip: req.ip,
        userAgent: req.get("user-agent"),
    });
    // 📤 Response
    res.status(200).json({
        success: true,
        message: `Payroll status updated to draft for ${employee.firstName} ${employee.lastName}`,
        data: payroll,
    });
});
exports.reverseSinglePayroll = (0, asyncHandler_1.asyncHandler)(async (req, res, next) => {
    const { payrollId } = req.params;
    const company = req.company;
    const companyId = company?._id;
    const userId = req.user?._id;
    if (!companyId)
        return next(new ErrorResponse_1.default("Company not found", 404));
    const payroll = await PayrollNew_1.default.findById(payrollId).populate("user");
    if (!payroll)
        return next(new ErrorResponse_1.default("Payroll not found", 404));
    if (payroll.company.toString() !== companyId.toString()) {
        return next(new ErrorResponse_1.default("Payroll does not belong to your company", 403));
    }
    if (payroll.status === "pending") {
        return next(new ErrorResponse_1.default("Payroll is already in draft status", 400));
    }
    const employee = payroll.user;
    payroll.status = "pending";
    await payroll.save();
    await (0, logAudit_1.logAudit)({
        userId,
        action: "REVERSE_SINGLE_PAYROLL",
        status: "SUCCESS",
        ip: req.ip,
        userAgent: req.get("user-agent"),
    });
    // 📤 Response
    res.status(200).json({
        success: true,
        message: `Payroll status updated to draft for ${employee.firstName} ${employee.lastName}`,
        data: payroll,
    });
});
exports.processSinglePayroll = (0, asyncHandler_1.asyncHandler)(async (req, res, next) => {
    const { payrollId } = req.params;
    const company = req.company;
    const companyId = company?._id;
    const userId = req.user?._id;
    // 🔎 Fetch payroll
    const payroll = await PayrollNew_1.default.findById(payrollId).populate("user");
    if (!payroll)
        return next(new ErrorResponse_1.default("Payroll not found", 404));
    // 🔒 Validation
    if (payroll.status !== "draft") {
        return next(new ErrorResponse_1.default("Only draft payrolls can be processed", 400));
    }
    const employee = payroll.user;
    // 🗓️ Month name (from number 1–12)
    const monthName = (0, export_service_1.getMonthName)(Number(payroll.month));
    // 📄 Generate Payroll Files
    const pdfBuffer = await export_service_1.ExportService.generatePayrollPDF(payroll, employee, company);
    const excelBuffer = await export_service_1.ExportService.generatePayrollExcel(payroll, employee, company);
    // ☁️ Upload to Cloudinary
    const pdfUpload = await (0, cloudinary_1.uploadToCloudinary)(pdfBuffer, `payroll/${companyId}`, "raw", `payroll_${employee.firstName}_${employee.lastName}_${monthName}_${payroll.year}.pdf`);
    const excelUpload = await (0, cloudinary_1.uploadToCloudinary)(excelBuffer, `payroll/${companyId}`, "raw", `payroll_${employee.firstName}_${employee.lastName}_${monthName}_${payroll.year}.xlsx`);
    const pdfUrl = pdfUpload.secure_url;
    const excelUrl = excelUpload.secure_url;
    const accountLead = await user_model_1.default.findOne({
        company: companyId,
        department: "account",
        role: "teamlead",
    });
    if (accountLead) {
        await (0, sendNotification_1.sendNotification)({
            user: accountLead,
            type: "PAYSLIP",
            title: `Payroll Processed – ${employee.firstName} ${employee.lastName} (${monthName} ${payroll.year})`,
            message: `Payroll for ${employee.firstName} ${employee.lastName} has been processed for ${monthName} ${payroll.year}. Files available below.`,
            emailSubject: `Payroll Processed – ${employee.firstName} ${employee.lastName} (${monthName} ${payroll.year})`,
            emailTemplate: "payroll-notification.ejs",
            emailData: {
                name: accountLead.firstName,
                staffName: `${employee.firstName} ${employee.lastName}`,
                month: monthName,
                year: payroll.year,
                pdfUrl,
                excelUrl,
                companyName: company?.branding?.displayName || company?.name,
                logoUrl: company?.branding?.logoUrl,
                primaryColor: company?.branding?.primaryColor || "#0621b6b0",
            },
        });
    }
    // ✅ Mark payroll as processed
    payroll.status = "processed";
    await payroll.save();
    // 📝 Audit Log
    await (0, logAudit_1.logAudit)({
        userId,
        action: "PROCESS_SINGLE_PAYROLL",
        status: "SUCCESS",
        ip: req.ip,
        userAgent: req.get("user-agent"),
    });
    // 📤 Response
    res.status(200).json({
        success: true,
        message: "Payroll processed successfully; team lead notified.",
        data: payroll,
    });
});
exports.markPayrollAsPaid = (0, asyncHandler_1.asyncHandler)(async (req, res, next) => {
    const { payrollId } = req.params;
    const company = req.company;
    const companyId = company?._id;
    const userId = req.user?._id;
    if (!companyId)
        return next(new ErrorResponse_1.default("Company not found", 404));
    const payroll = await PayrollNew_1.default.findById(payrollId).populate("user");
    if (!payroll)
        return next(new ErrorResponse_1.default("Payroll not found", 404));
    if (payroll.company.toString() !== companyId.toString()) {
        return next(new ErrorResponse_1.default("Payroll does not belong to your company", 403));
    }
    if (payroll.status === "paid") {
        return next(new ErrorResponse_1.default("Payroll is already marked as paid", 400));
    }
    const employee = payroll.user;
    // 🗓️ Month name
    const monthName = new Date(payroll.year, Number(payroll.month) - 1)
        .toLocaleString("default", { month: "long" });
    // ✅ Update status
    payroll.status = "paid";
    await payroll.save();
    // 📲 Notify employee
    await (0, sendNotification_1.sendNotification)({
        user: employee,
        type: "PAYSLIP",
        title: `Your Payslip for ${monthName} ${payroll.year} is Ready`,
        message: `Your payslip for ${monthName} ${payroll.year} has been paid and is now available for download in your HRIS.`,
        emailSubject: `Payslip - ${monthName} ${payroll.year}`,
        emailTemplate: "payslip-notification.ejs",
        emailData: {
            name: employee.firstName,
            month: monthName,
            year: payroll.year,
            companyName: company?.branding?.displayName || company?.name,
            logoUrl: company?.branding?.logoUrl,
            primaryColor: company?.branding?.primaryColor || "#0621b6b0",
        },
    });
    // 📝 Audit
    await (0, logAudit_1.logAudit)({
        userId,
        action: "MARK_PAYROLL_AS_PAID",
        status: "SUCCESS",
        ip: req.ip,
        userAgent: req.get("user-agent"),
    });
    res.status(200).json({
        success: true,
        message: `Payroll marked as paid and employee ${employee.firstName} ${employee.lastName} notified.`,
        data: payroll,
    });
});
exports.markPayrollsAsPaidBulk = (0, asyncHandler_1.asyncHandler)(async (req, res, next) => {
    const { month, year } = req.body;
    const company = req.company;
    const companyId = company?._id;
    const userId = req.user?._id;
    if (!companyId)
        return next(new ErrorResponse_1.default("Company not found", 404));
    if (!month || !year)
        return next(new ErrorResponse_1.default("Month and year are required", 400));
    const payrolls = await PayrollNew_1.default.find({
        company: companyId,
        month,
        year,
        status: "processed",
    }).populate("user");
    if (payrolls.length === 0) {
        return next(new ErrorResponse_1.default(`No processed payrolls found for ${(0, export_service_1.getMonthName)(month)} ${year}`, 404));
    }
    const limit = (0, p_limit_1.default)(20);
    const results = await Promise.all(payrolls.map((payroll) => limit(async () => {
        try {
            payroll.status = "paid";
            await payroll.save();
            const employee = payroll.user;
            const monthName = (0, export_service_1.getMonthName)(Number(payroll.month));
            await (0, sendNotification_1.sendNotification)({
                user: employee,
                type: "PAYSLIP",
                title: `Your Payslip for ${monthName} ${payroll.year} is Ready`,
                message: `Your payslip for ${monthName} ${payroll.year} has been paid and is now available in your HRIS.`,
                emailSubject: `Payslip - ${monthName} ${payroll.year}`,
                emailTemplate: "payslip-notification.ejs",
                emailData: {
                    name: employee.firstName,
                    month: monthName,
                    year: payroll.year,
                    companyName: company?.branding?.displayName || company?.name,
                    logoUrl: company?.branding?.logoUrl,
                    primaryColor: company?.branding?.primaryColor || "#0621b6b0",
                },
            });
            return {
                success: true,
                payrollId: payroll._id,
                employee: `${employee.firstName} ${employee.lastName}`,
            };
        }
        catch (err) {
            return { success: false, payrollId: payroll._id, error: err.message };
        }
    })));
    const successes = results.filter((r) => r.success);
    const failures = results.filter((r) => !r.success);
    await (0, logAudit_1.logAudit)({
        userId,
        action: "MARK_BULK_PAYROLL_AS_PAID",
        status: "SUCCESS",
        ip: req.ip,
        userAgent: req.get("user-agent"),
    });
    res.status(200).json({
        success: true,
        message: `Bulk payroll update completed for ${(0, export_service_1.getMonthName)(month)} ${year}. ${successes.length} paid, ${failures.length} failed.`,
        data: { successes, failures },
    });
});
exports.markPayrollsAsDraftBulk = (0, asyncHandler_1.asyncHandler)(async (req, res, next) => {
    const { month, year } = req.body;
    const company = req.company;
    const companyId = company?._id;
    const userId = req.user?._id;
    if (!companyId)
        return next(new ErrorResponse_1.default("Company not found", 404));
    if (!month || !year)
        return next(new ErrorResponse_1.default("Month and year are required", 400));
    // ✅ Find payrolls to draft
    const payrolls = await PayrollNew_1.default.find({
        company: companyId,
        month,
        year,
        status: { $ne: "draft" }, // skip ones already draft
    }).populate("user");
    if (payrolls.length === 0) {
        return next(new ErrorResponse_1.default(`No payrolls found to draft for ${(0, export_service_1.getMonthName)(month)} ${year}`, 404));
    }
    const limit = (0, p_limit_1.default)(20);
    const results = await Promise.all(payrolls.map((payroll) => limit(async () => {
        try {
            payroll.status = "draft";
            await payroll.save();
            const employee = payroll.user;
            return {
                success: true,
                payrollId: payroll._id,
                employee: `${employee.firstName} ${employee.lastName}`,
            };
        }
        catch (err) {
            return { success: false, payrollId: payroll._id, error: err.message };
        }
    })));
    const successes = results.filter((r) => r.success);
    const failures = results.filter((r) => !r.success);
    await (0, logAudit_1.logAudit)({
        userId,
        action: "MARK_BULK_PAYROLL_AS_DRAFT",
        status: "SUCCESS",
        ip: req.ip,
        userAgent: req.get("user-agent"),
    });
    res.status(200).json({
        success: true,
        message: `Bulk payroll draft completed for ${(0, export_service_1.getMonthName)(month)} ${year}. ${successes.length} drafted, ${failures.length} failed.`,
        data: { successes, failures },
    });
});
exports.reverseBulkPayroll = (0, asyncHandler_1.asyncHandler)(async (req, res, next) => {
    const { month, year } = req.body;
    const company = req.company;
    const companyId = company?._id;
    const userId = req.user?._id;
    if (!companyId)
        return next(new ErrorResponse_1.default("Company not found", 404));
    if (!month || !year) {
        return next(new ErrorResponse_1.default("Month and year are required", 400));
    }
    const payrolls = await PayrollNew_1.default.find({
        company: companyId,
        month,
        year,
    }).populate("user");
    if (payrolls.length === 0) {
        return next(new ErrorResponse_1.default("No payrolls found for this period", 404));
    }
    const reversed = [];
    const errors = [];
    for (const payroll of payrolls) {
        try {
            if (payroll.status === "pending") {
                errors.push({
                    payrollId: payroll._id,
                    error: "Payroll is already in pending status",
                });
                continue;
            }
            payroll.status = "pending";
            await payroll.save();
            reversed.push(payroll);
        }
        catch (err) {
            errors.push({
                payrollId: payroll._id,
                error: err.message || "Failed to reverse payroll",
            });
        }
    }
    if (reversed.length === 0) {
        return next(new ErrorResponse_1.default("No payrolls were reversed", 400));
    }
    // 📝 Audit Log
    await (0, logAudit_1.logAudit)({
        userId,
        action: "REVERSE_BULK_PAYROLL",
        status: "SUCCESS",
        ip: req.ip,
        userAgent: req.get("user-agent"),
    });
    // 📤 Response
    res.status(200).json({
        success: true,
        message: `Bulk payroll reversal completed for ${(0, export_service_1.getMonthName)(month)} ${year}. ${reversed.length} payroll(s) reversed, ${errors.length} failed.`,
        data: {
            reversedCount: reversed.length,
            reversed,
        },
        errors,
    });
});
exports.processBulkPayroll = (0, asyncHandler_1.asyncHandler)(async (req, res, next) => {
    const { month, year } = req.body;
    const company = req.company;
    const companyId = company?._id;
    const userId = req.user?._id;
    if (!month || !year) {
        return next(new ErrorResponse_1.default("Month and year are required", 400));
    }
    const payrolls = await PayrollNew_1.default.find({
        company: companyId,
        month,
        year,
        status: "draft",
    }).populate("user");
    if (payrolls.length === 0) {
        return next(new ErrorResponse_1.default("No draft payrolls found for this period", 404));
    }
    const monthName = (0, export_service_1.getMonthName)(Number(month));
    // 📝 Prepare bulk items for ExportService
    const items = payrolls.map((payroll) => ({
        payroll,
        employee: payroll.user,
    }));
    // 📄 Generate ONE merged PDF and ONE merged Excel
    const [pdfBuffer, excelBuffer] = await Promise.all([
        export_service_1.ExportService.generatePayrollPDF(items, company),
        export_service_1.ExportService.generatePayrollExcel(items, company),
    ]);
    // ☁️ Upload single merged files
    const [pdfUpload, excelUpload] = await Promise.all([
        (0, cloudinary_1.uploadToCloudinary)(pdfBuffer, `payroll/${companyId}`, "raw", `bulk_${monthName}_${year}_payroll.pdf`),
        (0, cloudinary_1.uploadToCloudinary)(excelBuffer, `payroll/${companyId}`, "raw", `bulk_${monthName}_${year}_payroll.xlsx`),
    ]);
    const pdfUrl = pdfUpload.secure_url;
    const excelUrl = excelUpload.secure_url;
    // ✅ Mark all payrolls as processed
    await PayrollNew_1.default.updateMany({ _id: { $in: payrolls.map((p) => p._id) } }, { $set: { status: "processed" } });
    // 👥 Notify IT team lead
    const accountLead = await user_model_1.default.findOne({
        company: companyId,
        department: "account",
        role: "teamlead",
    });
    if (accountLead) {
        await (0, sendNotification_1.sendNotification)({
            user: accountLead,
            type: "PAYSLIP",
            title: `Bulk Payroll Processed – ${payrolls.length} Employees`,
            message: `Payroll for ${payrolls.length} employees has been processed for ${monthName} ${year}. Files available below.`,
            emailSubject: `Bulk Payroll Processed – ${payrolls.length} Employees`,
            emailTemplate: "payroll-notification.ejs",
            emailData: {
                name: accountLead.firstName,
                staffName: `${accountLead.firstName} ${accountLead.lastName}`,
                month: monthName,
                year: year,
                pdfUrl,
                excelUrl,
                companyName: company?.branding?.displayName || company?.name,
                logoUrl: company?.branding?.logoUrl,
                primaryColor: company?.branding?.primaryColor || "#0621b6b0",
            },
        });
    }
    // 📝 Audit Log
    await (0, logAudit_1.logAudit)({
        userId,
        action: "PROCESS_BULK_PAYROLL",
        status: "SUCCESS",
        ip: req.ip,
        userAgent: req.get("user-agent"),
    });
    // 📤 Response
    res.status(200).json({
        success: true,
        message: `Bulk payroll processed for ${monthName} ${year}.`,
        data: {
            count: payrolls.length,
            pdfUrl,
            excelUrl,
        },
    });
});
