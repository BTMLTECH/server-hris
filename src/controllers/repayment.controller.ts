"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRepaymentHistory = exports.makeLoanRepayment = void 0;
const asyncHandler_1 = require("../middleware/asyncHandler");
const LoanRepayment_1 = __importDefault(require("../models/LoanRepayment"));
const LoanRequest_1 = __importDefault(require("../models/LoanRequest"));
const user_model_1 = __importDefault(require("../models/user.model"));
const sendNotification_1 = require("../utils/sendNotification");
const ErrorResponse_1 = __importDefault(require("../utils/ErrorResponse"));
exports.makeLoanRepayment = (0, asyncHandler_1.asyncHandler)(async (req, res, next) => {
    const { loanId, amountPaid } = req.body;
    const userId = req.user?.id;
    if (!loanId)
        throw new ErrorResponse_1.default('Invalid loanId', 400);
    const loan = await LoanRequest_1.default.findById(loanId);
    if (!loan)
        throw new ErrorResponse_1.default('Loan not found', 404);
    if (!loan.user.equals(userId)) {
        throw new ErrorResponse_1.default('You are not allowed to repay this loan', 403);
    }
    // Step 1: Check total already paid
    const repaymentStats = await LoanRepayment_1.default.aggregate([
        { $match: { loanId } },
        { $group: { _id: '$loanId', totalPaid: { $sum: '$amountPaid' } } },
    ]);
    const totalPaid = repaymentStats[0]?.totalPaid || 0;
    const remainingBalance = loan.amount - totalPaid;
    if (amountPaid > remainingBalance) {
        throw new ErrorResponse_1.default(`Overpayment not allowed. Remaining balance is ₦${remainingBalance.toLocaleString()}`, 400);
    }
    // Step 2: Ensure 1 payment per month
    const lastPayment = await LoanRepayment_1.default.findOne({ loanId, user: userId }).sort({ paymentDate: -1 });
    if (lastPayment) {
        const nextAllowedPayment = new Date(lastPayment.paymentDate);
        nextAllowedPayment.setMonth(nextAllowedPayment.getMonth() + 1);
        if (new Date() < nextAllowedPayment) {
            throw new ErrorResponse_1.default(`Only one payment allowed per month. Next allowed: ${nextAllowedPayment.toDateString()}`, 400);
        }
    }
    // Step 3: Create repayment
    const repayment = await LoanRepayment_1.default.create({
        loanId,
        user: userId,
        amountPaid,
    });
    // Step 4: Mark loan as completed if fully paid
    const newTotalPaid = totalPaid + amountPaid;
    if (newTotalPaid >= loan.amount) {
        loan.status = 'Completed';
        loan.completedAt = new Date();
        await loan.save();
    }
    // Step 5: Send notification and email receipt
    const user = await user_model_1.default.findById(userId);
    if (user) {
        await (0, sendNotification_1.sendNotification)({
            user,
            type: 'LOAN_REPAYMENT',
            title: 'Loan Repayment Recorded',
            message: `You have successfully made a repayment of ₦${amountPaid.toLocaleString()} for your loan.`,
            metadata: {
                loanId: loan._id,
                amountPaid,
                remainingBalance: loan.amount - newTotalPaid,
            },
            emailSubject: 'Loan Repayment Receipt',
            emailTemplate: 'loan-repayment-receipt.ejs',
            emailData: {
                amountPaid: amountPaid.toLocaleString(),
                loanAmount: loan.amount.toLocaleString(),
                remainingBalance: (loan.amount - newTotalPaid).toLocaleString(),
                paymentDate: new Date().toLocaleDateString(),
                userName: user.firstName,
            },
        });
    }
    // Step 6: Send response
    res.status(201).json({
        success: true,
        message: 'Repayment recorded successfully',
        data: repayment,
    });
});
// View repayment history
exports.getRepaymentHistory = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const userId = req.user?._id;
    const repayments = await LoanRepayment_1.default.find({ user: userId })
        .populate('loanId', 'type amount status createdAt')
        .sort({ paymentDate: -1 });
    res.status(200).json({
        success: true,
        data: repayments,
    });
});
