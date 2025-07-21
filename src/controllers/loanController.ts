import { NextFunction } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import LoanRequest, { ILoanRequest, LoanReviewLevel } from "../models/LoanRequest";
import { TypedRequest } from "../types/typedRequest";
import { TypedResponse } from "../types/typedResponse";
import ErrorResponse from "../utils/ErrorResponse";
import { logAudit } from "../utils/logAudit";
import { sendNotification } from "../utils/sendNotification";
import User, { IUser } from '../models/user.model';
import { Types } from "mongoose";
import { CreateLoanDTO, CreateLoanResponse,ApproveLoanRequest, GetLoanActivityFeedDTO, LoanActivityFeedItem  } from "../types/loanType";
import LoanRepayment from "../models/LoanRepayment";



export const createLoanRequest = asyncHandler(async (
  req: TypedRequest<{}, {}, CreateLoanDTO>,
  res: TypedResponse<CreateLoanResponse>,
  next: NextFunction
) => {
  try {
    const { type, amount, repaymentPeriod, reason, teamLead } = req.body;
    const userId = req.user?.id;

    if (!type || !amount || !repaymentPeriod || !reason || !teamLead) {
      return next(new ErrorResponse('All fields are required', 400));
    }

    if (amount <= 0 || repaymentPeriod <= 0) {
      return next(new ErrorResponse('Invalid loan amount or repayment period', 400));
    }

    const monthlyDeduction = Math.ceil(amount / repaymentPeriod);

    const loan = await LoanRequest.create({
      user: userId,
      teamLead,
      type,
      amount,
      repaymentPeriod,
      monthlyDeduction,
      reason,
      status: 'Pending',
      reviewLevel: 'TeamLead',
      reviewTrail: [],  // No reviews yet
    });

    // Notify applicant (Employee)
    await sendNotification({
      user: req.user!,
      type: 'INFO',
      title: 'Loan Request Submitted',
      message: `You submitted a ${type} loan request of ₦${amount.toLocaleString()} over ${repaymentPeriod} months. Status: Pending for Approval.`,
      emailSubject: 'Loan Request Submitted',
      emailTemplate: 'loan-request-submitted.ejs',  // You’ll create this template
      emailData: {
        name: req.user?.firstName,
        type,
        amount,
        repaymentPeriod,
        monthlyDeduction,
      },
    });

    // Notify Team Lead (first approver)
    const lead = await User.findById(teamLead);
    if (lead) {
      await sendNotification({
        user: lead,
        type: 'NEW_LOAN_REQUEST',
        title: 'New Loan Request',
        message: `${req.user?.firstName} submitted a ${type} loan request of ₦${amount.toLocaleString()}.`,
        emailSubject: 'New Loan Request to Review',
        emailTemplate: 'loan-review-request.ejs',  // You’ll create this template too
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

    await logAudit({
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

  } catch (err) {
    next(err);
  }
});

export const approveLoanRequest = async (
  req: TypedRequest<{ id: string }, {}, CreateLoanDTO>,
  res: TypedResponse<ApproveLoanRequest>,
  next: NextFunction
) => {
  try {
    const loanId = req.params.id;
    const reviewer = req.user!;
    const reviewerRole = reviewer.role;
    const reviewerId = reviewer._id as Types.ObjectId;

    const loan = await LoanRequest.findById(loanId).populate<{user: IUser}>('user', 'firstName lastName email');

    if (!loan) return next(new ErrorResponse('Loan request not found', 404));
    if (loan.status !== 'Pending') return next(new ErrorResponse('Loan already reviewed', 400));

    const currentLevel = loan.reviewLevel;

    // ✅ Strict role validation
    const levelRoleMap: Record<LoanReviewLevel, string> = {
      teamlead: 'teamlead',
      hod: 'hod',
      hr: 'hr',
      md: 'md',
    };

    if (levelRoleMap[currentLevel] !== reviewerRole) {
      return next(new ErrorResponse('You are not authorized to review this loan request at this stage', 403));
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
    } else if (currentLevel === 'hr') {
      loan.reviewLevel = 'md';
    } else if (currentLevel === 'md') {
      loan.status = 'Approved';  // Final approval
    }

    await loan.save();

    // ✅ Notify next reviewer or applicant
    if (loan.status === 'Approved') {
      await sendNotification({
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
    } else {
      const nextRole = loan.reviewLevel;
      const nextReviewer = await User.findOne({
        role: nextRole,
        department: reviewer.department,
        company: reviewer.company,
      });

      if (nextReviewer) {
        await sendNotification({
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

    await logAudit({
      userId: reviewerId,
      action: 'APPROVE_LOAN_REQUEST',
      status: 'SUCCESS',
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.status(200).json({ success: true, message: 'Loan approved', data: { data: loan } });

  } catch (err: any) {
    next(new ErrorResponse(err.message, 500));
  }
};

export const rejectLoanRequest = async (
  req: TypedRequest<{ id: string }, {}, CreateLoanDTO>,
  res: TypedResponse<ApproveLoanRequest>,
  next: NextFunction
) => {
  try {
    const loanId = req.params.id;
    const { note } = req.body;
    const reviewer = req.user!;
    const reviewerRole = reviewer.role;
    const reviewerId = reviewer._id as Types.ObjectId;

    const loan = await LoanRequest.findById(loanId).populate<{user: IUser}>('user', 'firstName lastName email');

    if (!loan) return next(new ErrorResponse('Loan request not found', 404));
    if (loan.status !== 'Pending') return next(new ErrorResponse('Loan already reviewed', 400));

    const currentLevel = loan.reviewLevel;

    // ✅ Strict role-based check
    const levelRoleMap: Record<LoanReviewLevel, string> = {
      teamlead: 'teamlead',
      hod: 'hod',
      hr: 'hr',
      md: 'md',
    };

    if (levelRoleMap[currentLevel] !== reviewerRole) {
      return next(new ErrorResponse('You are not authorized to review this loan at this stage', 403));
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
    await sendNotification({
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
        note,  // ✅ Pass note to email template
      },
    });

    await logAudit({
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

  } catch (err: any) {
    next(new ErrorResponse(err.message, 500));
  }
};

export const getLoanApprovalQueue = async (
  req: TypedRequest,
  res: TypedResponse<{ data: ILoanRequest[] }>,
  next: NextFunction
): Promise<void> => {
  try {
    const role = req.user?.role;
    const userId = req.user?.id;

    const filter: any = { status: 'Pending' };

    if (role === 'teamlead') {
      filter.reviewLevel = 'teamlead';
      filter.teamlead = userId;
    }  else if (role === 'hr') {
      filter.reviewLevel = 'hr';
    } else if (role === 'md') {
      filter.reviewLevel = 'md';
    } else {
      res.status(200).json({ success: true, data: { data: [] } });
      return;
    }

  

    const loans = await LoanRequest.find(filter)
      .populate('user', 'firstName lastName email')
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, data: { data: loans } });

  } catch (err: any) {
    next(err);
  }
};

export const getLoanActivityFeed = asyncHandler(async (
  req: TypedRequest<{}, GetLoanActivityFeedDTO>,
  res: TypedResponse<LoanActivityFeedItem[]>,
) => {
  const userId = req.user?._id;
  const { status, from, to } = req.query;

  if (!userId) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  const filter: any = { user: userId };

  if (status) filter.status = status;
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(from);
    if (to) filter.createdAt.$lte = new Date(to);
  }

  const loans = await LoanRequest.find(filter)
    .sort({ createdAt: -1 })
    .limit(20)
    .select('type amount repaymentPeriod status createdAt reviewTrail');

  const feed: LoanActivityFeedItem[] = loans.map((loan) => {
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

export const getLoanStatusOverview = asyncHandler(async (
  req: TypedRequest,
  res: TypedResponse<any>,
) => {
  const userId = req.user?._id;

  const statuses = ['Pending', 'Approved', 'Rejected', 'Disbursed', 'Completed'];

  const counts = await Promise.all(
    statuses.map(async (status) => {
      const count = await LoanRequest.countDocuments({ user: userId, status });
      return { status, count };
    })
  );

  const overview: Record<string, number> = {};
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



export const getLoanBalanceOverview = asyncHandler(async (
  req: TypedRequest,
  res: TypedResponse<any>,
) => {
  const userId = req.user?._id;

  // Step 1: Get all the user's loans
  const loans = await LoanRequest.find({
    user: userId,
    status: { $in: ['Approved', 'Disbursed'] },
  });


  const loanIds = loans.map((loan) => loan.id);


  // Step 2: Aggregate repayments per loan
  const repayments = await LoanRepayment.aggregate([
    { $match: { loanId: { $in: loanIds } } },
    {
      $group: {
        _id: '$loanId',
        totalRepaid: { $sum: '$amountPaid' },
      },
    },
  ]);


  // Convert to a Map using string keys
  const repaymentMap = new Map(
    repayments.map((r) => [r._id.toString(), r.totalRepaid])
  );


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
