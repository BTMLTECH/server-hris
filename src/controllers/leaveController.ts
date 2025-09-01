"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLeaveStatusOverview = exports.getLeaveApprovers = exports.getLeaveActivityFeed = exports.getLeaveApprovalQueue = exports.rejectLeaveRequest = exports.approveLeaveRequest = exports.createLeaveRequest = void 0;
const asyncHandler_1 = require("../middleware/asyncHandler");
const LeaveRequest_1 = __importStar(require("../models/LeaveRequest"));
const user_model_1 = __importDefault(require("../models/user.model"));
const ErrorResponse_1 = __importDefault(require("../utils/ErrorResponse"));
const logAudit_1 = require("../utils/logAudit");
const sendNotification_1 = require("../utils/sendNotification");
const redisClient_1 = require("../utils/redisClient");
const cloudinary_1 = require("../utils/cloudinary");
const LeaveBalance_1 = __importDefault(require("../models/LeaveBalance"));
exports.createLeaveRequest = (0, asyncHandler_1.asyncHandler)(async (req, res, next) => {
    const { type, startDate, endDate, days, reason, teamleadId, typeIdentify, allowance, relievers: relieverEmails } = req.body;
    const userId = req.user?.id;
    const company = req?.company;
    if (!type || !startDate || !endDate || !reason || !teamleadId || !days) {
        return next(new ErrorResponse_1.default('All fields are required', 400));
    }
    if (!relieverEmails || relieverEmails.length < 2 || relieverEmails.length > 3) {
        return next(new ErrorResponse_1.default('You must provide 2 or 3 relievers', 400));
    }
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (end < start) {
        return next(new ErrorResponse_1.default('Invalid date range', 400));
    }
    // 🔑 Get or initialize leave balance
    let balance = await LeaveBalance_1.default.findOne({ user: userId, year: new Date().getFullYear() });
    if (!balance)
        balance = await LeaveBalance_1.default.create({ user: userId });
    if (days > balance.balances[type]) {
        return next(new ErrorResponse_1.default(`Insufficient ${type} leave balance. You only have ${balance.balances[type]} days left.`, 400));
    }
    // 🔑 Deduct leave immediately
    balance.balances[type] -= days;
    await balance.save();
    // 🔑 Handle file upload
    let fileUrl;
    if (req.file) {
        const uploadedFile = await (0, cloudinary_1.uploadToCloudinary)(req.file.buffer, `leave/${company?._id}`, 'raw', `leave_${req.user?.firstName}_${req.user?.lastName}_${Date.now()}.pdf`);
        fileUrl = uploadedFile.secure_url;
    }
    // 🔑 Convert reliever emails to User objects
    const relieverUsers = await user_model_1.default.find({ email: { $in: relieverEmails } });
    if (relieverUsers.length < 2 || relieverUsers.length > 3) {
        return next(new ErrorResponse_1.default('Some relievers are invalid', 400));
    }
    // 🔑 Format relievers properly for schema
    const relieversWithNames = relieverUsers.map(reliever => ({
        user: reliever._id,
        firstName: reliever.firstName,
        lastName: reliever.lastName,
    }));
    // 🔑 Prepare review levels
    const reviewLevels = [
        ...relieversWithNames.map(() => 'reliever'),
        'teamlead',
        'hr'
    ];
    // 🔑 Create leave request
    const leave = await LeaveRequest_1.default.create({
        user: userId,
        teamlead: teamleadId,
        relievers: relieversWithNames,
        type,
        startDate: start,
        endDate: end,
        days: Number(days),
        reason,
        status: 'Pending',
        reviewLevels,
        typeIdentify,
        allowance: allowance === 'yes',
        url: fileUrl,
        reviewTrail: [],
    });
    try {
        await Promise.all(relieverUsers.map(async (reliever) => {
            try {
                await (0, sendNotification_1.sendNotification)({
                    user: reliever,
                    type: 'NEW_LEAVE_REQUEST',
                    title: 'Leave Request Requires Your Review',
                    message: `${req.user?.firstName} submitted a ${type} leave from ${startDate} to ${endDate}. You are listed as a reliever.`,
                    emailSubject: 'Leave Request to Review',
                    emailTemplate: 'leave-review-request.ejs',
                    emailData: {
                        reviewerName: reliever.firstName,
                        employeeName: req.user?.firstName,
                        type,
                        startDate,
                        endDate,
                        daysCount: days,
                        companyName: company?.branding?.displayName || company?.name,
                        logoUrl: company?.branding?.logoUrl,
                        primaryColor: company?.branding?.primaryColor || "#0621b6b0",
                    },
                });
            }
            catch (notifyErr) {
            }
        }));
    }
    catch (err) {
    }
    // 🔑 Audit log
    await (0, logAudit_1.logAudit)({
        userId,
        action: 'CREATE_LEAVE_REQUEST',
        status: 'SUCCESS',
        ip: req.ip,
        userAgent: req.get('user-agent'),
    });
    res.status(201).json({
        success: true,
        message: 'Leave request submitted',
        data: { data: leave },
    });
});
const approveLeaveRequest = async (req, res, next) => {
    try {
        const leaveId = req.params.id;
        const reviewer = req.user;
        const reviewerId = reviewer._id;
        const company = req.company;
        // Fetch leave with user + teamlead populated
        const leave = await LeaveRequest_1.default.findById(leaveId)
            .populate('user teamlead')
            .lean();
        if (!leave)
            return next(new ErrorResponse_1.default('Leave not found', 404));
        if (leave.status !== 'Pending')
            return next(new ErrorResponse_1.default('Leave already reviewed', 400));
        const completedReviews = leave.reviewTrail?.length || 0;
        const currentLevel = leave.reviewLevels[completedReviews];
        const relievers = leave.relievers || [];
        // ✅ Add approval record
        if (currentLevel === 'reliever') {
            const reliever = relievers.find(r => r.user.toString() === reviewerId.toString());
            if (reliever) {
                reliever.status = 'Approved';
                reliever.createdAt = new Date();
            }
        }
        leave.reviewTrail.push({
            reviewer: reviewerId,
            role: currentLevel,
            action: 'Approved',
            date: new Date(),
        });
        // ✅ Update leave status if last stage
        const isLastStage = completedReviews + 1 === leave.reviewLevels.length;
        if (isLastStage) {
            leave.status = 'Approved';
        }
        await LeaveRequest_1.default.updateOne({ _id: leaveId }, leave);
        // ✅ Send notifications
        if (isLastStage) {
            // Notify employee
            await (0, sendNotification_1.sendNotification)({
                user: leave.user,
                type: 'LEAVE_APPROVED',
                title: 'Leave Approved ✅',
                message: `Your ${leave.type} leave has been fully approved.`,
                emailSubject: 'Leave Approved',
                emailTemplate: 'leave-approved.ejs',
                emailData: {
                    name: leave.user.firstName,
                    type: leave.type,
                    startDate: leave.startDate,
                    endDate: leave.endDate,
                    days: leave.days,
                    companyName: company?.branding?.displayName || company?.name,
                    logoUrl: company?.branding?.logoUrl,
                    primaryColor: company?.branding?.primaryColor || '#0621b6b0',
                },
            });
        }
        else {
            // Notify next reviewer
            const nextLevel = leave.reviewLevels[completedReviews + 1];
            if (nextLevel === 'reliever') {
                const nextReliever = relievers.find(r => r.status === 'Pending');
                if (nextReliever) {
                    const userNext = await user_model_1.default.findById(nextReliever.user);
                    if (userNext) {
                        await (0, sendNotification_1.sendNotification)({
                            user: userNext,
                            type: 'LEAVE_AWAITING_REVIEW',
                            title: 'Leave Awaiting Review',
                            message: `${leave.user.firstName}'s ${leave.type} leave is pending your review.`,
                            emailSubject: 'Leave Approval Needed',
                            emailTemplate: 'leave-review-request.ejs',
                            emailData: {
                                reviewerName: userNext.firstName,
                                employeeName: leave.user.firstName,
                                type: leave.type,
                                startDate: leave.startDate,
                                endDate: leave.endDate,
                                days: leave.days,
                                companyName: company?.branding?.displayName || company?.name,
                                logoUrl: company?.branding?.logoUrl,
                                primaryColor: company?.branding?.primaryColor || '#0621b6b0',
                            },
                        });
                    }
                }
            }
            else {
                const nextReviewer = nextLevel === 'teamlead'
                    ? await user_model_1.default.findById(leave.teamlead)
                    : await user_model_1.default.findOne({ role: 'hr', company: reviewer.company });
                if (nextReviewer) {
                    await (0, sendNotification_1.sendNotification)({
                        user: nextReviewer,
                        type: 'LEAVE_AWAITING_REVIEW',
                        title: 'Leave Awaiting Review',
                        message: `${leave.user.firstName}'s ${leave.type} leave is pending your review.`,
                        emailSubject: 'Leave Approval Needed',
                        emailTemplate: 'leave-review-request.ejs',
                        emailData: {
                            reviewerName: nextReviewer.firstName,
                            employeeName: leave.user.firstName,
                            type: leave.type,
                            startDate: leave.startDate,
                            endDate: leave.endDate,
                            days: leave.days,
                            companyName: company?.branding?.displayName || company?.name,
                            logoUrl: company?.branding?.logoUrl,
                            primaryColor: company?.branding?.primaryColor || '#0621b6b0',
                        },
                    });
                }
            }
        }
        await (0, logAudit_1.logAudit)({
            userId: reviewerId,
            action: 'APPROVE_LEAVE_REQUEST',
            status: 'SUCCESS',
            ip: req.ip,
            userAgent: req.get('user-agent'),
        });
        res.status(200).json({
            success: true,
            message: isLastStage ? 'Leave fully approved' : 'Leave approved at current stage',
            data: { data: leave },
        });
    }
    catch (err) {
        next(new ErrorResponse_1.default(err.message, 500));
    }
};
exports.approveLeaveRequest = approveLeaveRequest;
const rejectLeaveRequest = async (req, res, next) => {
    try {
        const leaveId = req.params.id;
        const reviewer = req.user;
        const reviewerId = reviewer._id;
        const company = req.company;
        // Fetch leave with user + teamlead populated
        const leave = await LeaveRequest_1.default.findById(leaveId)
            .populate('user teamlead')
            .lean();
        if (!leave)
            return next(new ErrorResponse_1.default('Leave not found', 404));
        if (leave.status !== 'Pending')
            return next(new ErrorResponse_1.default('Leave already reviewed', 400));
        const completedReviews = leave.reviewTrail?.length || 0;
        const currentLevel = leave.reviewLevels[completedReviews];
        // ✅ Mark leave as rejected
        leave.status = 'Rejected';
        // ✅ If reliever stage, update that reliever record
        if (currentLevel === 'reliever') {
            const relievers = leave.relievers || [];
            const reliever = relievers.find(r => r.user.toString() === reviewerId.toString());
            if (reliever) {
                reliever.status = 'Rejected';
                reliever.createdAt = new Date();
            }
            leave.relievers = relievers;
        }
        // ✅ Record rejection in reviewTrail
        leave.reviewTrail.push({
            reviewer: reviewerId,
            role: currentLevel,
            action: 'Rejected',
            date: new Date(),
        });
        await LeaveRequest_1.default.updateOne({ _id: leaveId }, leave);
        // ✅ Notify employee immediately
        await (0, sendNotification_1.sendNotification)({
            user: leave.user,
            type: 'LEAVE_REJECTED',
            title: 'Leave Rejected ❌',
            message: `Your ${leave.type} leave has been rejected.`,
            emailSubject: 'Leave Rejected',
            emailTemplate: 'leave-rejected.ejs',
            emailData: {
                name: leave.user.firstName,
                type: leave.type,
                startDate: leave.startDate,
                endDate: leave.endDate,
                days: leave.days,
                companyName: company?.branding?.displayName || company?.name,
                logoUrl: company?.branding?.logoUrl,
                primaryColor: company?.branding?.primaryColor || '#0621b6b0',
            },
        });
        await (0, logAudit_1.logAudit)({
            userId: reviewerId,
            action: 'REJECT_LEAVE_REQUEST',
            status: 'SUCCESS',
            ip: req.ip,
            userAgent: req.get('user-agent'),
        });
        res.status(200).json({
            success: true,
            message: 'Leave rejected',
            data: { data: leave },
        });
    }
    catch (err) {
        next(new ErrorResponse_1.default(err.message, 500));
    }
};
exports.rejectLeaveRequest = rejectLeaveRequest;
const getLeaveApprovalQueue = async (req, res, next) => {
    try {
        const role = req.user?.role;
        const userId = req.user?._id;
        const userEmail = req.user?.email;
        if (!role) {
            res.status(200).json({ success: true, data: { data: [] } });
            return;
        }
        // Base filter: only "Pending" leaves
        const baseFilter = { status: 'Pending' };
        let filter = {};
        if (role === 'reliever') {
            // Relievers approve at their stage, and must be in the relievers list
            filter = {
                ...baseFilter,
                relievers: userEmail,
            };
        }
        else if (role === 'teamlead') {
            // Teamlead approval step, must match this teamlead
            filter = {
                ...baseFilter,
                teamlead: userId,
            };
        }
        else if (role === 'hr') {
            // HR has no extra restriction besides being the current approver
            filter = {
                ...baseFilter,
            };
        }
        else {
            // Non-approvers get an empty list
            res.status(200).json({ success: true, data: { data: [] } });
            return;
        }
        // Pull pending leaves and filter by "current stage = this user's role"
        const leaves = await LeaveRequest_1.default.find(filter)
            .populate('user', 'firstName lastName email')
            .sort({ createdAt: -1 });
        // Filter in memory to ensure role is actually the *current approver*
        const queue = leaves.filter((leave) => {
            const completedReviews = leave.reviewTrail.length;
            const currentLevel = leave.reviewLevels[completedReviews];
            return currentLevel === role;
        });
        res.status(200).json({ success: true, data: { data: queue } });
    }
    catch (err) {
        next(err);
    }
};
exports.getLeaveApprovalQueue = getLeaveApprovalQueue;
exports.getLeaveActivityFeed = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const userId = req.user?._id;
    const { status, from, to } = req.query;
    if (!userId) {
        return res.status(401).json({ success: false, message: "User not authenticated" });
    }
    // 🔹 1) Base filter
    const baseFilter = {};
    if (status) {
        baseFilter.status = {
            $in: [status, String(status).charAt(0).toUpperCase() + String(status).slice(1)],
        };
    }
    if (from || to) {
        baseFilter.createdAt = {};
        if (from)
            baseFilter.createdAt.$gte = new Date(from);
        if (to)
            baseFilter.createdAt.$lte = new Date(to);
    }
    // 🔹 2) My own requests
    const myRequestsRaw = await LeaveRequest_1.default.find({
        ...baseFilter,
        user: userId,
    })
        .sort({ createdAt: -1 })
        .limit(20)
        .select('_id type startDate endDate days status reason createdAt user teamlead reviewTrail relievers allowance url')
        .populate('user', 'firstName lastName')
        .lean();
    // 🔹 3) Approvals for me (stage-based flow)
    const roleConditions = [];
    // (a) Reliever stage → current user has a pending reliever task
    roleConditions.push({
        relievers: {
            $elemMatch: {
                user: userId,
                status: { $in: ['Pending', 'pending'] },
            },
        },
        status: { $nin: ['Rejected', 'rejected'] },
    });
    // (b) Teamlead stage → all relievers approved, teamlead not yet acted
    roleConditions.push({
        teamlead: userId,
        status: { $in: ['Pending', 'pending'] },
        relievers: {
            $not: {
                $elemMatch: {
                    status: { $in: ['Pending', 'pending', 'Rejected', 'rejected'] },
                },
            },
        },
        $nor: [{ reviewTrail: { $elemMatch: { role: 'teamlead' } } }],
    });
    // (c) HR stage → all relievers approved + teamlead approved + HR not yet acted
    if (req.user?.role === 'hr') {
        roleConditions.push({
            status: { $in: ['Pending', 'pending'] },
            // ✅ all relievers must be approved
            relievers: {
                $not: {
                    $elemMatch: {
                        status: { $in: ['Pending', 'pending', 'Rejected', 'rejected'] },
                    },
                },
            },
            // ✅ teamlead approved
            reviewTrail: {
                $elemMatch: { role: 'teamlead', action: { $in: ['Approved', 'approved'] } },
            },
            // ✅ HR not yet acted
            $nor: [{ reviewTrail: { $elemMatch: { role: 'hr' } } }],
        });
    }
    const approvalsRaw = await LeaveRequest_1.default.find({
        ...baseFilter,
        $or: roleConditions,
    })
        .sort({ createdAt: -1 })
        .limit(20)
        .select('_id type startDate endDate days status reason createdAt user teamlead reviewTrail relievers allowance url')
        .populate('user', 'firstName lastName')
        .lean();
    // 🔹 4) Map helper
    const mapLeave = (leave) => {
        let currentReviewerRole = null;
        // (a) Reliever stage
        const pendingReliever = leave.relievers?.find((r) => r?.user?.toString?.() === userId?.toString?.() &&
            ['pending', 'Pending'].includes(r?.status));
        if (pendingReliever) {
            currentReviewerRole = 'reliever';
        }
        else {
            // (b) Teamlead stage
            const allRelieversApproved = Array.isArray(leave.relievers) &&
                leave.relievers.length > 0 &&
                leave.relievers.every((r) => ['approved', 'Approved'].includes(r?.status));
            const teamleadAlreadyApproved = leave.reviewTrail?.some((r) => r.role === 'teamlead' && ['approved', 'Approved'].includes(r.action));
            if (allRelieversApproved &&
                leave.teamlead?.toString?.() === userId?.toString?.() &&
                !teamleadAlreadyApproved) {
                currentReviewerRole = 'teamlead';
            }
            else {
                // (c) HR stage
                const teamleadApproved = leave.reviewTrail?.some((r) => r.role === 'teamlead' && ['approved', 'Approved'].includes(r.action));
                const hrAlreadyApproved = leave.reviewTrail?.some((r) => r.role === 'hr' && ['approved', 'Approved'].includes(r.action));
                const allRelieversApprovedForHR = Array.isArray(leave.relievers) &&
                    leave.relievers.length > 0 &&
                    leave.relievers.every((r) => ['approved', 'Approved'].includes(r?.status));
                if (req.user?.role === 'hr' &&
                    teamleadApproved &&
                    allRelieversApprovedForHR &&
                    !hrAlreadyApproved) {
                    currentReviewerRole = 'hr';
                }
            }
        }
        return {
            id: leave._id.toString(),
            employeeId: leave.user?._id?.toString() ?? '',
            employeeName: `${leave.user?.firstName ?? ''} ${leave.user?.lastName ?? ''}`.trim(),
            type: leave.type,
            startDate: leave.startDate,
            endDate: leave.endDate,
            days: leave.days,
            reason: leave.reason,
            status: String(leave.status).toLowerCase(),
            appliedDate: leave.createdAt,
            teamleadId: leave.teamlead?.toString?.() ?? '',
            teamleadName: '', // no populate for teamlead yet
            currentReviewerRole,
            relievers: (leave.relievers ?? []).map((r) => ({
                user: r.user?.toString?.() ?? '',
                firstName: r.firstName,
                lastName: r.lastName,
                status: String(r.status ?? 'pending').toLowerCase(),
                note: r.note ?? undefined,
                actedAt: r.actedAt ?? undefined,
            })),
            reviewTrail: (leave.reviewTrail ?? []).map((r) => ({
                reviewer: r.reviewer?.toString?.() ?? '',
                role: r.role,
                action: String(r.action).toLowerCase(),
                date: r.date ? new Date(r.date).toISOString() : '',
                note: r.note,
            })),
            allowance: !!leave.allowance,
            url: leave.url ?? undefined,
        };
    };
    // 🔹 5) Summary
    const allUserLeaves = await LeaveRequest_1.default.find({ user: userId }).select('status').lean();
    const summary = {
        pending: allUserLeaves.filter(l => ['pending', 'Pending'].includes(l.status)).length,
        approved: allUserLeaves.filter(l => ['approved', 'Approved'].includes(l.status)).length,
        rejected: allUserLeaves.filter(l => ['rejected', 'Rejected'].includes(l.status)).length,
        expired: allUserLeaves.filter(l => ['expired', 'Expired'].includes(l.status)).length,
    };
    // 🔹 6) Leave balances
    const year = new Date().getFullYear();
    const leaveBalance = await LeaveBalance_1.default.findOne({ user: userId, year }).lean();
    const balance = leaveBalance
        ? Object.entries(leaveBalance.balances).map(([type, remaining]) => ({
            type: type,
            remaining,
        }))
        : Object.entries(LeaveRequest_1.LeaveEntitlements).map(([type, entitlement]) => ({
            type: type,
            remaining: entitlement,
        }));
    // 🔹 7) Return
    res.status(200).json({
        success: true,
        data: {
            myRequests: myRequestsRaw.map(mapLeave),
            approvals: approvalsRaw.map(mapLeave),
            summary,
            balance,
        },
    });
});
exports.getLeaveApprovers = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const currentUser = await user_model_1.default.findById(req.user?.id);
    if (!currentUser) {
        return res.status(404).json({ success: false, message: 'User not found' });
    }
    let approverRoles = [];
    let cacheKey = '';
    switch (currentUser.role) {
        case 'employee':
            // Employee → Reliever(s) + Teamlead + HR
            approverRoles = ['reliever', 'teamlead', 'hr'];
            cacheKey = `approvers:employee:${currentUser.company}:${currentUser.department}`;
            break;
        case 'teamlead':
            // Teamlead → HR
            approverRoles = ['hr'];
            cacheKey = `approvers:teamlead:${currentUser.company}`;
            break;
        case 'hr':
            approverRoles = [];
            cacheKey = `approvers:hr:${currentUser.company}`;
            break;
        default:
            return res.status(400).json({ success: false, message: 'Invalid role' });
    }
    // 🗄️ Check cache
    const cached = await redisClient_1.redisClient.get(cacheKey);
    if (cached) {
        return res.status(200).json({
            success: true,
            data: JSON.parse(cached),
            cached: true,
        });
    }
    if (approverRoles.length === 0) {
        return res.status(200).json({
            success: true,
            data: [],
            cached: false,
        });
    }
    // 🔍 Build DB query
    const query = {
        role: { $in: approverRoles },
        company: currentUser.company,
        isActive: true,
    };
    if (currentUser.role === 'employee') {
        // Relievers & teamlead must be in same dept
        query.$or = [
            { role: 'reliever', department: currentUser.department },
            { role: 'teamlead', department: currentUser.department },
            { role: 'hr' }, // HR is company-wide
        ];
    }
    const approvers = await user_model_1.default.find(query).select('_id firstName lastName department role');
    // 📌 Organize results: relievers first, then teamlead, then HR
    const relievers = approvers.filter((u) => u);
    const teamlead = approvers.find((u) => u.role === 'teamlead');
    const hr = approvers.find((u) => u.role === 'hr');
    const orderedApprovers = [
        ...relievers.map((u) => ({
            id: u._id,
            name: `${u.firstName} ${u.lastName}`,
            department: u.department,
            role: u.role,
        })),
        ...(teamlead
            ? [{
                    id: teamlead._id,
                    name: `${teamlead.firstName} ${teamlead.lastName}`,
                    department: teamlead.department,
                    role: teamlead.role,
                }]
            : []),
        ...(hr
            ? [{
                    id: hr._id,
                    name: `${hr.firstName} ${hr.lastName}`,
                    department: hr.department,
                    role: hr.role,
                }]
            : []),
    ];
    // ✅ Cache result for 1 day
    await redisClient_1.redisClient.setex(cacheKey, 86400, JSON.stringify(orderedApprovers));
    res.status(200).json({
        success: true,
        data: orderedApprovers,
        cached: false,
    });
});
const getLeaveStatusOverview = async (req, res, next) => {
    try {
        const userId = req.user?._id;
        if (!userId) {
            res.status(401).json({
                success: false,
                message: 'Unauthorized',
            });
            return;
        }
        const [pending, approved, rejected] = await Promise.all([
            LeaveRequest_1.default.countDocuments({ user: userId, status: 'Pending' }),
            LeaveRequest_1.default.countDocuments({ user: userId, status: 'Approved' }),
            LeaveRequest_1.default.countDocuments({ user: userId, status: 'Rejected' }),
        ]);
        const total = pending + approved + rejected;
        res.status(200).json({
            success: true,
            data: { pending, approved, rejected, total },
        });
    }
    catch (err) {
        next(err);
    }
};
exports.getLeaveStatusOverview = getLeaveStatusOverview;
