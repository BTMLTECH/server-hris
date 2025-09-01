"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteHandoverById = exports.getTeamLeadByEmployeeDepartment = exports.getMyHandovers = exports.createHandoverReport = void 0;
const sendNotification_1 = require("../utils/sendNotification");
const logAudit_1 = require("../utils/logAudit");
const asyncHandler_1 = require("../middleware/asyncHandler");
const HandoverReport_1 = __importDefault(require("../models/HandoverReport"));
const user_model_1 = __importDefault(require("../models/user.model"));
const cloudinary_1 = require("../utils/cloudinary");
const ErrorResponse_1 = __importDefault(require("../utils/ErrorResponse"));
const redisClient_1 = require("../utils/redisClient");
exports.createHandoverReport = (0, asyncHandler_1.asyncHandler)(async (req, res, next) => {
    const { date, shift, summary, teamlead } = req.body;
    const userId = req.user?._id;
    if (!date || !shift || !summary || !teamlead || !req.file) {
        return next(new ErrorResponse_1.default('All fields including PDF file are required.', 403));
    }
    const pdfResult = await (0, cloudinary_1.uploadToCloudinary)(req.file.buffer, 'btm/documents', 'auto', 'btmlimited');
    if (!pdfResult) {
        return next(new ErrorResponse_1.default('Failed to upload PDF file.', 403));
    }
    const company = req.company;
    const pdfUrl = pdfResult.secure_url;
    const handover = await HandoverReport_1.default.create({
        user: userId,
        teamlead,
        date,
        shift,
        summary,
        pdfFile: pdfUrl,
        employeename: `${req.user?.firstName} ${req.user?.lastName}`,
        status: 'submitted',
    });
    const teamleadUser = await user_model_1.default.findById(teamlead);
    if (teamleadUser) {
        await (0, sendNotification_1.sendNotification)({
            user: teamleadUser,
            type: 'NEW_HANDOVER',
            title: 'New Handover Report Submitted',
            message: `${req.user?.firstName} submitted a handover report for ${date}.`,
            emailSubject: 'New Handover Report to Review',
            emailTemplate: 'handover-review-request.ejs',
            emailData: {
                companyName: company?.branding?.displayName || company?.name,
                logoUrl: company?.branding?.logoUrl,
                primaryColor: company?.branding?.primaryColor || "#0621b6b0",
            }
        });
    }
    await (0, logAudit_1.logAudit)({
        userId,
        action: 'CREATE_HANDOVER_REPORT',
        status: 'SUCCESS',
        ip: req.ip,
        userAgent: req.get('user-agent'),
    });
    res.status(201).json({
        success: true,
        message: 'Handover report submitted',
        data: { data: handover },
    });
});
exports.getMyHandovers = (0, asyncHandler_1.asyncHandler)(async (req, res, next) => {
    const userId = req.user?._id;
    const handovers = await HandoverReport_1.default.find({ user: userId }).sort({ createdAt: -1 });
    res.status(200).json({
        success: true,
        message: 'Fetched current user handovers',
        data: { data: handovers },
    });
});
exports.getTeamLeadByEmployeeDepartment = (0, asyncHandler_1.asyncHandler)(async (req, res, next) => {
    const employeeId = req.user?._id;
    // Step 1: Check the cache for the teamlead based on employee's department
    const cacheKey = `teamlead:${employeeId}`;
    const cachedTeamlead = await redisClient_1.redisClient.get(cacheKey);
    if (cachedTeamlead) {
        return res.status(200).json({
            success: true,
            message: "Teamlead of your department (cached)",
            data: JSON.parse(cachedTeamlead),
        });
    }
    // Step 2: Find employee's department
    const employee = await user_model_1.default.findById(employeeId).select('department company');
    if (!employee) {
        return next(new ErrorResponse_1.default("Employee not found", 404));
    }
    // Step 3: Get the teamlead in the same department
    const teamlead = await user_model_1.default.findOne({
        department: employee.department,
        role: "teamlead",
        company: employee.company,
    }).select("firstName lastName email department company");
    if (!teamlead) {
        return next(new ErrorResponse_1.default("Teamlead not found for this department", 404));
    }
    // Cache the teamlead data with a 1-hour expiration (3600 seconds)
    await redisClient_1.redisClient.setex(cacheKey, 3600, JSON.stringify(teamlead));
    res.status(200).json({
        success: true,
        message: "Teamlead of your department",
        data: { data: teamlead },
    });
});
const deleteHandoverById = async (req, res, next) => {
    const handoverId = req.params.id;
    const handover = await HandoverReport_1.default.findById(handoverId);
    if (!handover) {
        return next(new ErrorResponse_1.default('Handover report not found', 404));
    }
    await handover.deleteOne();
    await (0, logAudit_1.logAudit)({
        userId: req.user?._id,
        action: 'DELETE_HANDOVER_REPORT',
        status: 'SUCCESS',
        ip: req.ip,
        userAgent: req.get('user-agent'),
    });
    res.status(200).json({
        success: true,
        message: 'Handover report deleted successfully',
    });
};
exports.deleteHandoverById = deleteHandoverById;
