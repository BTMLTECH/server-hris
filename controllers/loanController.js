"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLoanBalanceOverview = exports.getLoanStatusOverview = exports.getLoanActivityFeed = exports.getLoanApprovalQueue = exports.rejectLoanRequest = exports.approveLoanRequest = exports.createLoanRequest = void 0;
const asyncHandler_1 = require("../middleware/asyncHandler");
const LoanRequest_1 = __importDefault(require("../models/LoanRequest"));
const ErrorResponse_1 = __importDefault(require("../utils/ErrorResponse"));
const logAudit_1 = require("../utils/logAudit");
const sendNotification_1 = require("../utils/sendNotification");
const user_model_1 = __importDefault(require("../models/user.model"));
const LoanRepayment_1 = __importDefault(require("../models/LoanRepayment"));
exports.createLoanRequest = (0, asyncHandler_1.asyncHandler)(async (req, res, next) => {
    try {
        const { type, amount, repaymentPeriod, reason, teamLead } = req.body;
        const userId = req.user?.id;
        if (!type || !amount || !repaymentPeriod || !reason || !teamLead) {
            return next(new ErrorResponse_1.default('All fields are required', 400));
        }
        if (amount <= 0 || repaymentPeriod <= 0) {
            return next(new ErrorResponse_1.default('Invalid loan amount or repayment period', 400));
        }
        const monthlyDeduction = Math.ceil(amount / repaymentPeriod);
        const loan = await LoanRequest_1.default.create({
            user: userId,
            teamLead,
            type,
            amount,
            repaymentPeriod,
            monthlyDeduction,
            reason,
            status: 'Pending',
            reviewLevel: 'TeamLead',
            reviewTrail: [], // No reviews yet
        });
        // Notify applicant (Employee)
        await (0, sendNotification_1.sendNotification)({
            user: req.user,
            type: 'INFO',
            title: 'Loan Request Submitted',
            message: `You submitted a ${type} loan request of ₦${amount.toLocaleString()} over ${repaymentPeriod} months. Status: Pending for Approval.`,
            emailSubject: 'Loan Request Submitted',
            emailTemplate: 'loan-request-submitted.ejs', // You’ll create this template
            emailData: {
                name: req.user?.firstName,
                type,
                amount,
                repaymentPeriod,
                monthlyDeduction,
            },
        });
        // Notify Team Lead (first approver)
        const lead = await user_model_1.default.findById(teamLead);
        if (lead) {
            await (0, sendNotification_1.sendNotification)({
                user: lead,
                type: 'NEW_LOAN_REQUEST',
                title: 'New Loan Request',
                message: `${req.user?.firstName} submitted a ${type} loan request of ₦${amount.toLocaleString()}.`,
                emailSubject: 'New Loan Request to Review',
                emailTemplate: 'loan-review-request.ejs', // You’ll create this template too
                emailData: {
                    reviewerName: lead.firstName,
                    employeeName: req.user?.firstName,
                    type,
                    amount,
                    repaymentPeriod,
                    monthlyDeduction,
                },
            });
        }
        await (0, logAudit_1.logAudit)({
            userId,
            action: 'CREATE_LOAN_REQUEST',
            status: 'SUCCESS',
            ip: req.ip,
            userAgent: req.get('user-agent'),
        });
        res.status(201).json({
            success: true,
            message: 'Loan request submitted',
            data: { data: loan },
        });
    }
    catch (err) {
        next(err);
    }
});
const approveLoanRequest = async (req, res, next) => {
    try {
        const loanId = req.params.id;
        const reviewer = req.user;
        const reviewerRole = reviewer.role;
        const reviewerId = reviewer._id;
        const loan = await LoanRequest_1.default.findById(loanId).populate('user', 'firstName lastName email');
        if (!loan)
            return next(new ErrorResponse_1.default('Loan request not found', 404));
        if (loan.status !== 'Pending')
            return next(new ErrorResponse_1.default('Loan already reviewed', 400));
        const currentLevel = loan.reviewLevel;
        // ✅ Strict role validation
        const levelRoleMap = {
            teamlead: 'teamlead',
            hod: 'hod',
            hr: 'hr',
            md: 'md',
        };
        if (levelRoleMap[currentLevel] !== reviewerRole) {
            return next(new ErrorResponse_1.default('You are not authorized to review this loan request at this stage', 403));
        }
        // ✅ Approve the request
        loan.reviewTrail.push({
            reviewer: reviewerId,
            role: reviewerRole,
            action: 'Approved',
            date: new Date(),
        });
        // ✅ Advance or finalize
        if (currentLevel === 'teamlead') {
            loan.reviewLevel = 'hr';
        }
        else if (currentLevel === 'hr') {
            loan.reviewLevel = 'md';
        }
        else if (currentLevel === 'md') {
            loan.status = 'Approved'; // Final approval
        }
        await loan.save();
        // ✅ Notify next reviewer or applicant
        if (loan.status === 'Approved') {
            await (0, sendNotification_1.sendNotification)({
                user: loan.user,
                type: 'LOAN_APPROVED',
                title: 'Loan Approved ✅',
                message: `Your ${loan.type} loan request of ₦${loan.amount.toLocaleString()} has been fully approved.`,
                emailSubject: 'Loan Approved',
                emailTemplate: 'loan-approved.ejs',
                emailData: {
                    name: loan.user.firstName,
                    type: loan.type,
                    amount: loan.amount,
                    repaymentPeriod: loan.repaymentPeriod,
                    monthlyDeduction: loan.monthlyDeduction,
                },
            });
        }
        else {
            const nextRole = loan.reviewLevel;
            const nextReviewer = await user_model_1.default.findOne({
                role: nextRole,
                department: reviewer.department,
                company: reviewer.company,
            });
            if (nextReviewer) {
                await (0, sendNotification_1.sendNotification)({
                    user: nextReviewer,
                    type: 'LOAN_AWAITING_REVIEW',
                    title: 'Loan Awaiting Review',
                    message: `${loan.user.firstName}'s ${loan.type} loan of ₦${loan.amount.toLocaleString()} is pending your review.`,
                    emailSubject: 'Loan Approval Needed',
                    emailTemplate: 'loan-review-request.ejs',
                    emailData: {
                        reviewerName: nextReviewer.firstName,
                        employeeName: loan.user.firstName,
                        type: loan.type,
                        amount: loan.amount,
                        repaymentPeriod: loan.repaymentPeriod,
                        monthlyDeduction: loan.monthlyDeduction,
                    },
                });
            }
        }
        await (0, logAudit_1.logAudit)({
            userId: reviewerId,
            action: 'APPROVE_LOAN_REQUEST',
            status: 'SUCCESS',
            ip: req.ip,
            userAgent: req.get('user-agent'),
        });
        res.status(200).json({ success: true, message: 'Loan approved', data: { data: loan } });
    }
    catch (err) {
        next(new ErrorResponse_1.default(err.message, 500));
    }
};
exports.approveLoanRequest = approveLoanRequest;
const rejectLoanRequest = async (req, res, next) => {
    try {
        const loanId = req.params.id;
        const { note } = req.body;
        const reviewer = req.user;
        const reviewerRole = reviewer.role;
        const reviewerId = reviewer._id;
        const loan = await LoanRequest_1.default.findById(loanId).populate('user', 'firstName lastName email');
        if (!loan)
            return next(new ErrorResponse_1.default('Loan request not found', 404));
        if (loan.status !== 'Pending')
            return next(new ErrorResponse_1.default('Loan already reviewed', 400));
        const currentLevel = loan.reviewLevel;
        // ✅ Strict role-based check
        const levelRoleMap = {
            teamlead: 'teamlead',
            hod: 'hod',
            hr: 'hr',
            md: 'md',
        };
        if (levelRoleMap[currentLevel] !== reviewerRole) {
            return next(new ErrorResponse_1.default('You are not authorized to review this loan at this stage', 403));
        }
        // ✅ Reject loan
        loan.status = 'Rejected';
        loan.reviewTrail.push({
            reviewer: reviewerId,
            role: reviewerRole,
            action: 'Rejected',
            date: new Date(),
            note, // ✅ Add reason note here
        });
        await loan.save();
        // ✅ Notify applicant (employee)
        await (0, sendNotification_1.sendNotification)({
            user: loan.user,
            type: 'LOAN_REJECTED',
            title: 'Loan Request Rejected ❌',
            message: `Your ${loan.type} loan request of ₦${loan.amount.toLocaleString()} has been rejected.`,
            emailSubject: 'Loan Request Rejected',
            emailTemplate: 'loan-rejected.ejs',
            emailData: {
                name: loan.user.firstName,
                type: loan.type,
                amount: loan.amount,
                note, // ✅ Pass note to email template
            },
        });
        await (0, logAudit_1.logAudit)({
            userId: reviewerId,
            action: 'REJECT_LOAN_REQUEST',
            status: 'SUCCESS',
            ip: req.ip,
            userAgent: req.get('user-agent'),
        });
        res.status(200).json({
            success: true,
            message: 'Loan request rejected',
            data: { data: loan },
        });
    }
    catch (err) {
        next(new ErrorResponse_1.default(err.message, 500));
    }
};
exports.rejectLoanRequest = rejectLoanRequest;
const getLoanApprovalQueue = async (req, res, next) => {
    try {
        const role = req.user?.role;
        const userId = req.user?.id;
        const filter = { status: 'Pending' };
        if (role === 'teamlead') {
            filter.reviewLevel = 'teamlead';
            filter.teamlead = userId;
        }
        else if (role === 'hr') {
            filter.reviewLevel = 'hr';
        }
        else if (role === 'md') {
            filter.reviewLevel = 'md';
        }
        else {
            res.status(200).json({ success: true, data: { data: [] } });
            return;
        }
        const loans = await LoanRequest_1.default.find(filter)
            .populate('user', 'firstName lastName email')
            .sort({ createdAt: -1 });
        res.status(200).json({ success: true, data: { data: loans } });
    }
    catch (err) {
        next(err);
    }
};
exports.getLoanApprovalQueue = getLoanApprovalQueue;
exports.getLoanActivityFeed = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const userId = req.user?._id;
    const { status, from, to } = req.query;
    if (!userId) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    const filter = { user: userId };
    if (status)
        filter.status = status;
    if (from || to) {
        filter.createdAt = {};
        if (from)
            filter.createdAt.$gte = new Date(from);
        if (to)
            filter.createdAt.$lte = new Date(to);
    }
    const loans = await LoanRequest_1.default.find(filter)
        .sort({ createdAt: -1 })
        .limit(20)
        .select('type amount repaymentPeriod status createdAt reviewTrail');
    const feed = loans.map((loan) => {
        const latestReview = loan.reviewTrail?.[loan.reviewTrail.length - 1];
        return {
            type: loan.type,
            amount: loan.amount,
            repaymentPeriod: loan.repaymentPeriod,
            status: loan.status,
            appliedDate: loan.createdAt,
            lastReviewedBy: latestReview?.role || null,
            lastReviewDate: latestReview?.date || null,
            lastReviewNote: latestReview?.note || null,
            lastReviewAction: latestReview?.action || null,
        };
    });
    res.status(200).json({ success: true, data: feed });
});
exports.getLoanStatusOverview = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const userId = req.user?._id;
    const statuses = ['Pending', 'Approved', 'Rejected', 'Disbursed', 'Completed'];
    const counts = await Promise.all(statuses.map(async (status) => {
        const count = await LoanRequest_1.default.countDocuments({ user: userId, status });
        return { status, count };
    }));
    const overview = {};
    counts.forEach((item) => {
        overview[item.status] = item.count;
    });
    res.status(200).json({
        success: true,
        data: {
            pending: overview['Pending'] || 0,
            approved: overview['Approved'] || 0,
            rejected: overview['Rejected'] || 0,
            disbursed: overview['Disbursed'] || 0,
            completed: overview['Completed'] || 0,
        },
    });
});
exports.getLoanBalanceOverview = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const userId = req.user?._id;
    // Step 1: Get all the user's loans
    const loans = await LoanRequest_1.default.find({
        user: userId,
        status: { $in: ['Approved', 'Disbursed'] },
    });
    const loanIds = loans.map((loan) => loan.id);
    // Step 2: Aggregate repayments per loan
    const repayments = await LoanRepayment_1.default.aggregate([
        { $match: { loanId: { $in: loanIds } } },
        {
            $group: {
                _id: '$loanId',
                totalRepaid: { $sum: '$amountPaid' },
            },
        },
    ]);
    // Convert to a Map using string keys
    const repaymentMap = new Map(repayments.map((r) => [r._id.toString(), r.totalRepaid]));
    let totalLoaned = 0;
    let totalRepaid = 0;
    let totalMonthlyDeduction = 0;
    loans.forEach((loan) => {
        const repaid = repaymentMap.get(loan.id) || 0;
        totalLoaned += loan.amount;
        totalRepaid += repaid;
        totalMonthlyDeduction += loan.monthlyDeduction || 0;
    });
    const outstandingBalance = totalLoaned - totalRepaid;
    res.status(200).json({
        success: true,
        data: {
            totalLoaned,
            totalRepaid,
            outstandingBalance,
            monthlyDeduction: totalMonthlyDeduction,
        },
    });
});
