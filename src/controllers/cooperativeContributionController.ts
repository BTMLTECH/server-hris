"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAllCooperativeContributions = exports.rejectCooperativeContribution = exports.updateCooperativeContribution = exports.approveCooperativeContribution = exports.notifyHr = void 0;
const asyncHandler_1 = require("../middleware/asyncHandler");
const CooperativeContribution_1 = require("../models/CooperativeContribution");
const ErrorResponse_1 = __importDefault(require("../utils/ErrorResponse"));
const user_model_1 = __importDefault(require("../models/user.model"));
const cloudinary_1 = require("../utils/cloudinary");
const sendNotification_1 = require("../utils/sendNotification");
const logAudit_1 = require("../utils/logAudit");
exports.notifyHr = (0, asyncHandler_1.asyncHandler)(async (req, res, next) => {
    const { email, message, amount, month, year } = req.body;
    const company = req.company;
    const companyId = company?._id;
    const userId = req.user?._id;
    // 🔎 Fetch staff by email
    const staff = await user_model_1.default.findOne({
        email: email.toLowerCase(),
        company: companyId,
    });
    if (!staff)
        return next(new ErrorResponse_1.default("User not found", 404));
    // ☁️ Upload receipt if provided
    let receiptUrl;
    if (req.file?.buffer) {
        const uploadedFile = await (0, cloudinary_1.uploadToCloudinary)(req.file.buffer, `cooperative/${companyId}`, "raw", `contribution_${staff.firstName}_${staff.lastName}_${Date.now()}.pdf`);
        receiptUrl = uploadedFile.secure_url;
    }
    else {
        return next(new ErrorResponse_1.default("Receipt file is required", 400));
    }
    // 🗄️ Save contribution record
    const contribution = await CooperativeContribution_1.CooperativeContribution.create({
        user: staff._id,
        companyId,
        month,
        year,
        amount,
        receiptUrl,
        status: 'REQUEST'
    });
    // 👥 Find HR to notify
    const hr = await user_model_1.default.findOne({ company: companyId, role: "hr" });
    if (!hr)
        return next(new ErrorResponse_1.default("HR not found", 404));
    // 📧 Notify HR
    await (0, sendNotification_1.sendNotification)({
        user: hr,
        type: "COOPERATIVE_REQUEST",
        title: `Cooperative Request – ${staff.firstName} ${staff.lastName}`,
        message: `${staff.firstName} ${staff.lastName} contributed ₦${amount} for ${month}/${year}.`,
        emailSubject: `Cooperative Request – ${staff.firstName} ${staff.lastName}`,
        emailTemplate: "cooperative-confirmation.ejs",
        emailData: {
            name: hr.firstName,
            staffName: `${staff.firstName} ${staff.lastName}`,
            amount,
            message,
            pdfUrl: receiptUrl,
            month,
            year,
            companyName: company?.branding?.displayName || company?.name,
            logoUrl: company?.branding?.logoUrl,
            primaryColor: company?.branding?.primaryColor || "#0621b6b0",
        },
    });
    // 📝 Audit Log
    await (0, logAudit_1.logAudit)({
        userId,
        action: "CREATE_COOPERATIVE_CONTRIBUTION",
        status: "SUCCESS",
        ip: req.ip,
        userAgent: req.get("user-agent"),
    });
    // 📤 Response
    res.status(201).json({
        success: true,
        message: "Cooperative contribution created & HR notified.",
        data: contribution,
    });
});
exports.approveCooperativeContribution = (0, asyncHandler_1.asyncHandler)(async (req, res, next) => {
    const { id } = req.params;
    if (!id) {
        return next(new ErrorResponse_1.default('Contribution ID is required', 400));
    }
    // Find contribution by id
    const contribution = await CooperativeContribution_1.CooperativeContribution.findById(id);
    if (!contribution) {
        return next(new ErrorResponse_1.default('Contribution not found', 404));
    }
    // Update status to APPROVED
    contribution.status = "APPROVED";
    await contribution.save();
    return res.status(200).json({
        success: true,
        message: 'Contribution approved successfully',
        data: contribution,
    });
});
// Update contribution
exports.updateCooperativeContribution = (0, asyncHandler_1.asyncHandler)(async (req, res, next) => {
    const companyId = req.company?._id;
    const { id } = req.params;
    const allowedUpdates = ['month', 'year', 'amount'];
    const updates = {};
    for (const key of allowedUpdates) {
        if (req.body[key] !== undefined) {
            updates[key] = req.body[key];
        }
    }
    const updated = await CooperativeContribution_1.CooperativeContribution.findOneAndUpdate({ _id: id, companyId }, { $set: updates }, { new: true, runValidators: true });
    if (!updated) {
        return next(new ErrorResponse_1.default('Contribution not found for this company', 404));
    }
    return res.status(200).json({
        success: true,
        message: 'Contribution updated successfully',
        data: updated
    });
});
exports.rejectCooperativeContribution = (0, asyncHandler_1.asyncHandler)(async (req, res, next) => {
    const { id } = req.params;
    const companyId = req.company?._id;
    const contribution = await CooperativeContribution_1.CooperativeContribution.findOne({ _id: id, companyId });
    if (!contribution) {
        return next(new ErrorResponse_1.default('Contribution not found for this company', 404));
    }
    contribution.status = "REJECTED";
    await contribution.save();
    return res.status(200).json({
        success: true,
        message: 'Contribution rejected successfully',
        data: contribution
    });
});
exports.getAllCooperativeContributions = (0, asyncHandler_1.asyncHandler)(async (req, res, next) => {
    const companyId = req.company?._id;
    if (!companyId) {
        return next(new ErrorResponse_1.default('Company context not found', 400));
    }
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const query = { companyId };
    if (req.query.year)
        query.year = parseInt(req.query.year);
    if (req.query.month)
        query.month = parseInt(req.query.month);
    // 🔹 Fetch paginated contributions
    const [contributions, total] = await Promise.all([
        CooperativeContribution_1.CooperativeContribution.find(query)
            .populate('user', 'staffId firstName lastName department')
            .populate('companyId', 'name')
            .sort({ year: -1, month: -1 })
            .skip(skip)
            .limit(limit),
        CooperativeContribution_1.CooperativeContribution.countDocuments(query)
    ]);
    const lifetimeAgg = await CooperativeContribution_1.CooperativeContribution.aggregate([
        { $match: { companyId, status: { $in: ["APPROVED", "COLLECTED"] } } },
        { $group: { _id: null, total: { $sum: "$amount" } } }
    ]);
    const lifetimeTotal = lifetimeAgg[0]?.total || 0;
    const activeAgg = await CooperativeContribution_1.CooperativeContribution.aggregate([
        { $match: { companyId, status: "APPROVED" } },
        { $group: { _id: null, total: { $sum: "$amount" } } }
    ]);
    const activeBalance = activeAgg[0]?.total || 0;
    return res.status(200).json({
        success: true,
        data: {
            data: contributions,
            pagination: { total, page, limit, pages: Math.ceil(total / limit) },
            count: contributions.length,
            totals: {
                lifetimeTotal,
                activeBalance
            }
        }
    });
});
