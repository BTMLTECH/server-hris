"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getEmployeesByTeamLeadDepartment = exports.getAppraisalApprovalQueue = exports.rejectAppraisalRequest = exports.approveAppraisalRequest = exports.getAppraisalActivity = exports.updateAppraisalRequest = exports.createAppraisalRequest = void 0;
const AppraisalRequest_1 = __importDefault(require("../models/AppraisalRequest"));
const user_model_1 = __importDefault(require("../models/user.model"));
const asyncHandler_1 = require("../middleware/asyncHandler");
const ErrorResponse_1 = __importDefault(require("../utils/ErrorResponse"));
const logAudit_1 = require("../utils/logAudit");
const sendNotification_1 = require("../utils/sendNotification");
const redisClient_1 = require("../utils/redisClient");
exports.createAppraisalRequest = (0, asyncHandler_1.asyncHandler)(async (req, res, next) => {
    try {
        const { title, teamLeadId, period, dueDate, objectives } = req.body;
        if (!title || !teamLeadId || !period || !dueDate || !objectives || objectives.length === 0) {
            return next(new ErrorResponse_1.default('All fields including objectives are required', 400));
        }
        const totalScore = objectives.reduce((sum, obj) => sum + (obj.marks || 0), 0);
        if (totalScore !== 100) {
            return next(new ErrorResponse_1.default('Total appraisal score must equal 100 marks', 400));
        }
        const teamleadUser = await user_model_1.default.findById(teamLeadId);
        if (!teamleadUser || !teamleadUser.department) {
            return next(new ErrorResponse_1.default('Team lead or department not found', 404));
        }
        const employees = await user_model_1.default.find({
            department: teamleadUser.department,
            role: 'employee',
        });
        if (employees.length === 0) {
            return next(new ErrorResponse_1.default('No employees found in the department', 404));
        }
        const appraisalRequests = await Promise.all(employees.map(async (employee) => {
            const appraisal = await AppraisalRequest_1.default.create({
                title,
                user: employee._id,
                teamLeadId,
                department: teamleadUser.department,
                period,
                dueDate,
                objectives: objectives.map((obj) => ({
                    ...obj,
                    employeeScore: 0,
                    teamLeadScore: 0,
                    finalScore: 0,
                    employeeComments: '',
                    teamLeadComments: '',
                    evidence: '',
                })),
                totalScore: {
                    employee: 0,
                    teamLead: 0,
                    final: 0,
                },
                status: 'pending',
                reviewLevel: 'teamlead',
                reviewTrail: [],
                typeIdentify: 'appraisal'
            });
            await (0, sendNotification_1.sendNotification)({
                user: employee,
                type: 'NEW_APPRAISAL',
                title: 'New Appraisal Assigned',
                message: `A new appraisal titled "${title}" has been assigned to you. Please review and respond.`,
                emailSubject: 'New Appraisal Assigned',
                emailTemplate: 'appraisal-assigned.ejs',
                emailData: {
                    name: employee.firstName,
                    title,
                    period,
                    dueDate,
                },
            });
            return appraisal;
        }));
        await (0, logAudit_1.logAudit)({
            userId: req.user?.id,
            action: 'CREATE_APPRAISAL_REQUEST',
            status: 'SUCCESS',
            ip: req.ip,
            userAgent: req.get('user-agent'),
        });
        res.status(201).json({
            success: true,
            message: `${appraisalRequests.length} appraisal(s) created successfully`,
            data: appraisalRequests,
        });
    }
    catch (error) {
        next(new ErrorResponse_1.default(error.message, 500));
    }
});
exports.updateAppraisalRequest = (0, asyncHandler_1.asyncHandler)(async (req, res, next) => {
    try {
        const { id } = req.params;
        const updateData = req.body;
        const role = req.user?.role;
        const appraisal = await AppraisalRequest_1.default.findById(id);
        if (!appraisal) {
            return next(new ErrorResponse_1.default('Appraisal not found', 404));
        }
        if (updateData.status === 'update') {
            delete updateData.status;
        }
        if (updateData?.objectives) {
            const total = updateData.objectives.reduce((sum, obj) => sum + (obj.marks || 0), 0);
            if (total !== 100) {
                return next(new ErrorResponse_1.default('Total appraisal score must equal 100 marks', 400));
            }
            // Role-specific objective updates
            appraisal.objectives = appraisal.objectives.map((existingObj) => {
                const updatedObj = updateData.objectives?.find((o) => o.id === existingObj.id);
                if (!updatedObj)
                    return existingObj;
                switch (role) {
                    case 'employee':
                        return {
                            ...existingObj,
                            employeeScore: updatedObj.employeeScore ?? existingObj.employeeScore,
                            employeeComments: updatedObj.employeeComments ?? existingObj.employeeComments,
                        };
                    case 'teamlead':
                        return {
                            ...existingObj,
                            teamLeadScore: updatedObj.teamLeadScore ?? existingObj.teamLeadScore,
                            teamLeadComments: updatedObj.teamLeadComments ?? existingObj.teamLeadComments,
                        };
                    default:
                        return existingObj;
                }
            });
        }
        // --- Update other fields ---
        if (updateData.title)
            appraisal.title = updateData.title;
        if (updateData.period)
            appraisal.period = updateData.period;
        if (updateData.dueDate)
            appraisal.dueDate = updateData.dueDate;
        // 🚫 Only allow certain statuses
        const allowedStatuses = [
            'pending',
            'submitted',
            'needs_revision',
            'sent_to_employee',
        ];
        if (updateData.status && allowedStatuses.includes(updateData.status)) {
            appraisal.status = updateData.status;
        }
        if (updateData.revisionReason) {
            appraisal.revisionReason = updateData.revisionReason;
        }
        // --- Recalculate Totals (mirrors frontend) ---
        appraisal.totalScore.employee = appraisal.objectives.reduce((sum, obj) => sum + obj.employeeScore, 0);
        appraisal.totalScore.teamLead = appraisal.objectives.reduce((sum, obj) => sum + obj.teamLeadScore, 0);
        if (role === 'teamlead') {
            // ✅ TeamLead final = teamLead total
            appraisal.totalScore.final = appraisal.totalScore.teamLead;
        }
        else if (role === 'hr') {
            const hrAdjustmentsMap = {
                innovation: 3,
                commendation: 3,
                query: -4,
                majorError: -15,
            };
            appraisal.hrAdjustments = {
                innovation: !!updateData.hrAdjustments?.innovation,
                commendation: !!updateData.hrAdjustments?.commendation,
                query: !!updateData.hrAdjustments?.query,
                majorError: !!updateData.hrAdjustments?.majorError,
            };
            // ✅ Base = teamLead total
            let finalTotal = appraisal.totalScore.teamLead;
            // ✅ Apply HR adjustments
            Object.keys(appraisal.hrAdjustments).forEach((key) => {
                if (appraisal.hrAdjustments[key]) {
                    finalTotal += hrAdjustmentsMap[key];
                }
            });
            appraisal.totalScore.final = finalTotal;
        }
        else {
            // ✅ Employee cannot set final
            appraisal.totalScore.final = appraisal.totalScore.final || 0;
        }
        await appraisal.save();
        res.status(200).json({
            success: true,
            message: 'Appraisal updated successfully',
            data: appraisal,
        });
    }
    catch (error) {
        next(new ErrorResponse_1.default(error.message, 500));
    }
});
exports.getAppraisalActivity = (0, asyncHandler_1.asyncHandler)(async (req, res, next) => {
    try {
        const user = req.user;
        if (!user) {
            return next(new ErrorResponse_1.default("User not authenticated", 401));
        }
        const page = parseInt(req.query.page || "1");
        let limit = parseInt(req.query.limit || "10");
        if (limit > 50)
            limit = 50;
        const skip = (page - 1) * limit;
        let query = {};
        // Role-based query filter
        if (user.role === "admin") {
            query = {}; // Full access
        }
        else if (user.role === "hr") {
            query = {
                reviewLevel: "hr",
                status: { $in: ["submitted", "needs_revision"] },
                reviewTrail: { $elemMatch: { role: "teamlead", action: "approved" } },
                $nor: [{ reviewTrail: { $elemMatch: { role: "hr" } } }],
            };
        }
        else if (user.role === "teamlead") {
            query = {
                teamLeadId: user._id,
            };
        }
        else if (user.role === "employee") {
            query = { user: user._id };
        }
        // Status filter from query string
        const statusFilter = req.query.status;
        if (statusFilter && statusFilter !== "all") {
            query.status = statusFilter;
        }
        const total = await AppraisalRequest_1.default.countDocuments(query);
        const appraisals = await AppraisalRequest_1.default.find(query)
            .populate("user", "firstName lastName email")
            .sort({ updatedAt: -1 })
            .skip(skip)
            .limit(limit);
        res.status(200).json({
            success: true,
            message: "Appraisal activity fetched successfully",
            data: appraisals,
            pagination: {
                total,
                page,
                limit,
                pages: Math.ceil(total / limit),
            },
        });
    }
    catch (error) {
        next(new ErrorResponse_1.default(error.message, 500));
    }
});
const approveAppraisalRequest = async (req, res, next) => {
    try {
        const appraisalId = req.params.id;
        const reviewer = req.user;
        const reviewerId = reviewer._id;
        const appraisal = await AppraisalRequest_1.default.findById(appraisalId).populate('user');
        if (!appraisal)
            return next(new ErrorResponse_1.default('Appraisal not found', 404));
        if (!['submitted', 'needs_revision'].includes(appraisal.status)) {
            return next(new ErrorResponse_1.default('Appraisal already reviewed', 400));
        }
        const roleMap = {
            teamlead: 'teamlead',
            hr: 'hr',
        };
        if (roleMap[appraisal.reviewLevel] !== reviewer.role) {
            return next(new ErrorResponse_1.default('Not authorized to review this appraisal', 403));
        }
        appraisal.reviewTrail.push({
            reviewer: reviewerId,
            role: reviewer.role,
            action: 'approved',
            date: new Date(),
        });
        if (appraisal.reviewLevel === 'teamlead') {
            appraisal.reviewLevel = 'hr';
        }
        else if (appraisal.reviewLevel === 'hr') {
            appraisal.status = 'approved';
        }
        await appraisal.save();
        if (appraisal.status === 'approved') {
            await (0, sendNotification_1.sendNotification)({
                user: appraisal.user,
                type: 'APPRAISAL_APPROVED',
                title: 'Appraisal Approved',
                message: `Your appraisal "${appraisal.title}" has been fully approved.`,
                emailSubject: 'Appraisal Approved',
                emailTemplate: 'appraisal-approved.ejs',
                emailData: {
                    name: appraisal.user.firstName,
                    title: appraisal.title
                },
            });
        }
        await (0, logAudit_1.logAudit)({
            userId: reviewer._id,
            action: 'APPROVE_APPRAISAL',
            status: 'SUCCESS',
            ip: req.ip,
            userAgent: req.get('user-agent'),
        });
        res.status(200).json({ success: true, message: 'Appraisal approved', data: { data: appraisal } });
    }
    catch (error) {
        next(new ErrorResponse_1.default(error.message, 500));
    }
};
exports.approveAppraisalRequest = approveAppraisalRequest;
// Reject Appraisal
const rejectAppraisalRequest = async (req, res, next) => {
    try {
        const appraisalId = req.params.id;
        // const { note } = req.body;
        const reviewer = req.user;
        const reviewerId = reviewer._id;
        const appraisal = await AppraisalRequest_1.default.findById(appraisalId).populate('user');
        if (!appraisal)
            return next(new ErrorResponse_1.default('Appraisal not found', 404));
        if (!['submitted', 'needs_revision'].includes(appraisal.status)) {
            return next(new ErrorResponse_1.default('Appraisal already reviewed', 400));
        }
        const roleMap = {
            teamlead: 'teamlead',
            hr: 'hr'
        };
        if (roleMap[appraisal.reviewLevel] !== reviewer.role) {
            return next(new ErrorResponse_1.default('Not authorized to review this appraisal', 403));
        }
        appraisal.status = 'rejected';
        appraisal.reviewTrail.push({
            reviewer: reviewerId,
            role: reviewer.role,
            action: 'rejected',
            date: new Date(),
            // note,
        });
        // appraisal.status = 'rejected'
        await appraisal.save();
        await (0, sendNotification_1.sendNotification)({
            user: appraisal.user,
            type: 'APPRAISAL_REJECTED',
            title: 'Appraisal Rejected',
            message: `Your appraisal "${appraisal.title}" has been rejected`,
            emailSubject: 'Appraisal Rejected',
            emailTemplate: 'appraisal-rejected.ejs',
            emailData: {
                name: appraisal.user.firstName,
                title: appraisal.title,
                // note,
            },
        });
        await (0, logAudit_1.logAudit)({
            userId: reviewer._id,
            action: 'REJECT_APPRAISAL',
            status: 'SUCCESS',
            ip: req.ip,
            userAgent: req.get('user-agent'),
        });
        res.status(200).json({
            success: true,
            message: 'Appraisal rejected',
            data: { data: appraisal },
        });
    }
    catch (error) {
        next(new ErrorResponse_1.default(error.message, 500));
    }
};
exports.rejectAppraisalRequest = rejectAppraisalRequest;
// Get Appraisal Queue
exports.getAppraisalApprovalQueue = (0, asyncHandler_1.asyncHandler)(async (req, res, next) => {
    try {
        const role = req.user?.role;
        const userId = req.user?._id;
        let filter = { status: 'pending' };
        if (role === 'teamlead') {
            filter.reviewLevel = 'teamlead';
            filter.teamLead = userId;
        }
        else if (role === 'hr') {
            filter.reviewLevel = 'hr';
        }
        else {
            res.status(200).json({ success: true, data: { data: [] } });
            return;
        }
        const appraisals = await AppraisalRequest_1.default.find(filter)
            .populate('employee', 'firstName lastName email')
            .sort({ createdAt: -1 });
        res.status(200).json({ success: true, data: { data: appraisals } });
    }
    catch (error) {
        next(new ErrorResponse_1.default(error.message, 500));
    }
});
exports.getEmployeesByTeamLeadDepartment = (0, asyncHandler_1.asyncHandler)(async (req, res, next) => {
    const teamleadId = req.user?._id;
    const cacheKey = `employees:${teamleadId}`;
    const cachedEmployees = await redisClient_1.redisClient.get(cacheKey);
    if (cachedEmployees) {
        return res.status(200).json({
            success: true,
            message: "Employees in your department (cached)",
            data: JSON.parse(cachedEmployees),
        });
    }
    // Step 2: Find teamlead's department
    const teamlead = await user_model_1.default.findById(teamleadId).select("department company role");
    if (!teamlead || teamlead.role !== "teamlead") {
        return next(new ErrorResponse_1.default("TeamLead not found or not authorized", 404));
    }
    // Step 3: Get all employees in the same department as the teamlead
    const employees = await user_model_1.default.find({
        department: teamlead.department,
        role: "employee",
        company: teamlead.company,
    }).select("firstName lastName email department status");
    // Cache the employees' data with a 1-hour expiration (3600 seconds)
    await redisClient_1.redisClient.setex(cacheKey, 3600, JSON.stringify(employees));
    res.status(200).json({
        success: true,
        message: "Employees in your department",
        data: { data: employees },
    });
});
