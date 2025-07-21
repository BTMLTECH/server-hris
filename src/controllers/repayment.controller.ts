import { NextFunction } from 'express';

import { asyncHandler } from '../middleware/asyncHandler';
import LoanRepayment, { ILoanRepayment } from '../models/LoanRepayment';
import LoanRequest from '../models/LoanRequest';
import User from '../models/user.model';
import { IMakeLoanRepaymentDTO } from '../types/loanType';
import { TypedRequest } from '../types/typedRequest';
import { TypedResponse } from '../types/typedResponse';
import { sendNotification } from '../utils/sendNotification';
import ErrorResponse from '../utils/ErrorResponse';


export const makeLoanRepayment = asyncHandler(async (
  req: TypedRequest<{}, {}, IMakeLoanRepaymentDTO>,
  res: TypedResponse<ILoanRepayment>,
  next: NextFunction
) => {
  const { loanId, amountPaid } = req.body;
  const userId = req.user?.id;

  if (!loanId) throw new ErrorResponse('Invalid loanId', 400);

  const loan = await LoanRequest.findById(loanId);
  if (!loan) throw new ErrorResponse('Loan not found', 404);

  if (!loan.user.equals(userId)) {
    throw new ErrorResponse('You are not allowed to repay this loan', 403);
  }

  // Step 1: Check total already paid
  const repaymentStats = await LoanRepayment.aggregate([
    { $match: { loanId } },
    { $group: { _id: '$loanId', totalPaid: { $sum: '$amountPaid' } } },
  ]);

  const totalPaid = repaymentStats[0]?.totalPaid || 0;
  const remainingBalance = loan.amount - totalPaid;

  if (amountPaid > remainingBalance) {
    throw new ErrorResponse(`Overpayment not allowed. Remaining balance is ₦${remainingBalance.toLocaleString()}`, 400);
  }

  // Step 2: Ensure 1 payment per month
  const lastPayment = await LoanRepayment.findOne({ loanId, user: userId }).sort({ paymentDate: -1 });

  if (lastPayment) {
    const nextAllowedPayment = new Date(lastPayment.paymentDate);
    nextAllowedPayment.setMonth(nextAllowedPayment.getMonth() + 1);

    if (new Date() < nextAllowedPayment) {
      throw new ErrorResponse(`Only one payment allowed per month. Next allowed: ${nextAllowedPayment.toDateString()}`, 400);
    }
  }

  // Step 3: Create repayment
  const repayment = await LoanRepayment.create({
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
  const user = await User.findById(userId);
  if (user) {
    await sendNotification({
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
export const getRepaymentHistory = asyncHandler(async (
      req: TypedRequest,
      res: TypedResponse<ILoanRepayment[]>
) => {
  const userId = req.user?._id;

  const repayments = await LoanRepayment.find({ user: userId })
    .populate('loanId', 'type amount status createdAt')
    .sort({ paymentDate: -1 });

  res.status(200).json({
    success: true,
    data: repayments,
  });
});
