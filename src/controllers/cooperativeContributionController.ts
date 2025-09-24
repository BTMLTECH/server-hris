import { asyncHandler } from '../middleware/asyncHandler';
import { CooperativeContribution } from '../models/CooperativeContribution';
import { NextFunction } from 'express';
import { ContributionRequest } from '../types/contribution';
import { TypedRequest } from '../types/typedRequest';
import { TypedResponse } from '../types/typedResponse';
import ErrorResponse from '../utils/ErrorResponse';
import User from '../models/user.model';
import { uploadToCloudinary } from '../utils/cloudinary';
import { sendNotification } from '../utils/sendNotification';
import { logAudit } from '../utils/logAudit';

export const notifyHr = asyncHandler(
  async (
    req: TypedRequest<
      {},
      {},
      { email: string; message?: string; amount: number; month: number; year: number }
    >,
    res: TypedResponse<any>,
    next: NextFunction,
  ) => {
    const { email, message, amount, month, year } = req.body;
    const company = req.company;
    const companyId = company?._id;
    const userId = req.user?._id;

    // 🔎 Fetch staff by email
    const staff = await User.findOne({
      email: email.toLowerCase(),
      company: companyId,
    });
    if (!staff) return next(new ErrorResponse('User not found', 404));

    // ☁️ Upload receipt if provided
    let receiptUrl: string | undefined;
    if (req.file?.buffer) {
      const uploadedFile = await uploadToCloudinary(
        req.file.buffer,
        `cooperative/${companyId}`,
        'raw',
        `contribution_${staff.firstName}_${staff.lastName}_${Date.now()}.pdf`,
      );
      receiptUrl = uploadedFile.secure_url;
    } else {
      return next(new ErrorResponse('Receipt file is required', 400));
    }

    // 🗄️ Save contribution record
    const contribution = await CooperativeContribution.create({
      user: staff._id,
      companyId,
      month,
      year,
      amount,
      receiptUrl,
      status: 'REQUEST',
    });

    // 👥 Find HR to notify
    const hr = await User.findOne({ company: companyId, role: 'hr' });
    if (!hr) return next(new ErrorResponse('HR not found', 404));

    // 📧 Notify HR
    await sendNotification({
      user: hr,
      type: 'COOPERATIVE_REQUEST',
      title: `Cooperative Request – ${staff.firstName} ${staff.lastName}`,
      message: `${staff.firstName} ${staff.lastName} contributed ₦${amount} for ${month}/${year}.`,
      emailSubject: `Cooperative Request – ${staff.firstName} ${staff.lastName}`,
      emailTemplate: 'cooperative-confirmation.ejs',
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
        primaryColor: company?.branding?.primaryColor || '#0621b6b0',
      },
    });

    // 📝 Audit Log
    await logAudit({
      userId,
      action: 'CREATE_COOPERATIVE_CONTRIBUTION',
      status: 'SUCCESS',
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    // 📤 Response
    res.status(201).json({
      success: true,
      message: 'Cooperative contribution created & HR notified.',
      data: contribution,
    });
  },
);

export const approveCooperativeContribution = asyncHandler(
  async (
    req: TypedRequest<{ id?: string }, {}, {}>,
    res: TypedResponse<any>,
    next: NextFunction,
  ) => {
    const { id } = req.params;
    const companyId = req.company?._id;
    const userId = req.user?._id; // HR/admin performing the approval

    if (!id) {
      return next(new ErrorResponse('Contribution ID is required', 400));
    }

    // Find contribution scoped to company
    const contribution = await CooperativeContribution.findOne({ _id: id, companyId });
    if (!contribution) {
      return next(new ErrorResponse('Contribution not found for this company', 404));
    }

    // Capture old status for audit
    const oldStatus = contribution.status;

    // Update status to APPROVED
    contribution.status = 'APPROVED';
    await contribution.save();

    // 📝 Audit log
    await logAudit({
      userId,
      action: 'APPROVE_COOPERATIVE_CONTRIBUTION',
      status: 'SUCCESS',
      ip: req.ip,
      userAgent: req.get('user-agent'),
      details: {
        contributionId: contribution._id,
        oldStatus,
        newStatus: contribution.status,
        amount: contribution.amount,
        month: contribution.month,
        year: contribution.year,
      },
    });

    return res.status(200).json({
      success: true,
      message: 'Contribution approved successfully',
      data: contribution,
    });
  },
);

export const updateCooperativeContribution = asyncHandler(
  async (
    req: TypedRequest<{ id?: string }, {}, Partial<ContributionRequest>>,
    res: TypedResponse<any>,
    next: NextFunction,
  ) => {
    const companyId = req.company?._id;
    const userId = req.user?._id;
    const { id } = req.params;

    if (!id) {
      return next(new ErrorResponse('Contribution ID is required', 400));
    }

    const contribution = await CooperativeContribution.findOne({ _id: id, companyId });
    if (!contribution) {
      return next(new ErrorResponse('Contribution not found for this company', 404));
    }

    // Capture old values for audit
    const oldAmount = contribution.amount;
    const oldMonth = contribution.month;
    const oldYear = contribution.year;

    // Apply updates
    if (req.body.month !== undefined) contribution.month = req.body.month;
    if (req.body.year !== undefined) contribution.year = req.body.year;

    if (req.body.amount !== undefined) {
      contribution.amount = (contribution.amount || 0) + req.body.amount;
    }

    await contribution.save();

    // 📝 Audit log with before/after values
    await logAudit({
      userId,
      action: 'UPDATE_COOPERATIVE_CONTRIBUTION',
      status: 'SUCCESS',
      ip: req.ip,
      userAgent: req.get('user-agent'),
      details: {
        old: {
          amount: oldAmount,
          month: oldMonth,
          year: oldYear,
        },
        new: {
          amount: contribution.amount,
          month: contribution.month,
          year: contribution.year,
        },
      },
    });

    return res.status(200).json({
      success: true,
      message: 'Contribution updated successfully',
      data: contribution,
    });
  },
);

export const rejectCooperativeContribution = asyncHandler(
  async (
    req: TypedRequest<{ id?: string }, {}, {}>,
    res: TypedResponse<any>,
    next: NextFunction,
  ) => {
    const { id } = req.params;
    const companyId = req.company?._id;
    const userId = req.user?._id;

    const contribution = await CooperativeContribution.findOne({ _id: id, companyId });
    if (!contribution) {
      return next(new ErrorResponse('Contribution not found for this company', 404));
    }

    const oldStatus = contribution.status;
    contribution.status = 'REJECTED';
    await contribution.save();

    // 📝 Audit log
    await logAudit({
      userId,
      action: 'REJECT_COOPERATIVE_CONTRIBUTION',
      status: 'SUCCESS',
      ip: req.ip,
      userAgent: req.get('user-agent'),
      details: {
        contributionId: contribution._id,
        oldStatus,
        newStatus: contribution.status,
        amount: contribution.amount,
        month: contribution.month,
        year: contribution.year,
      },
    });

    return res.status(200).json({
      success: true,
      message: 'Contribution rejected successfully',
      data: contribution,
    });
  },
);

// export const getAllCooperativeContributions = asyncHandler(async (
//   req: TypedRequest<{}, { page?: string; limit?: string; year?: string; month?: string }>,
//   res: TypedResponse<any>,
//   next: NextFunction
// ) => {
//   const companyId = req.company?._id;

//   if (!companyId) {
//     return next(new ErrorResponse('Company context not found', 400));
//   }

//   const page = parseInt(req.query.page as string) || 1;
//   const limit = parseInt(req.query.limit as string) || 20;
//   const skip = (page - 1) * limit;

//   const query: any = { companyId };

//   if (req.query.year) query.year = parseInt(req.query.year);
//   if (req.query.month) query.month = parseInt(req.query.month);

//   // 🔹 Fetch paginated contributions
//   const [contributions, total] = await Promise.all([
//     CooperativeContribution.find(query)
//       .populate('user', 'staffId firstName lastName department')
//       .populate('companyId', 'name')
//       .sort({ year: -1, month: -1 })
//       .skip(skip)
//       .limit(limit),
//     CooperativeContribution.countDocuments(query)
//   ]);

//   const lifetimeAgg = await CooperativeContribution.aggregate([
//     { $match: { companyId, status: { $in: ["APPROVED", "COLLECTED"] } } },
//     { $group: { _id: null, total: { $sum: "$amount" } } }
//   ]);

//   const lifetimeTotal = lifetimeAgg[0]?.total || 0;

//   const activeAgg = await CooperativeContribution.aggregate([
//     { $match: { companyId, status: "APPROVED" } },
//     { $group: { _id: null, total: { $sum: "$amount" } } }
//   ]);

//   const activeBalance = activeAgg[0]?.total || 0;

//   return res.status(200).json({
//     success: true,
//     data: {
//       data: contributions,
//       pagination: { total, page, limit, pages: Math.ceil(total / limit) },
//       count: contributions.length,
//       totals: {
//         lifetimeTotal,
//         activeBalance
//       }
//     }
//   });
// });
export const getAllCooperativeContributions = asyncHandler(
  async (
    req: TypedRequest<{}, { page?: string; limit?: string; year?: string; month?: string }>,
    res: TypedResponse<any>,
    next: NextFunction,
  ) => {
    const companyId = req.company?._id;
    if (!companyId) {
      return next(new ErrorResponse('Company context not found', 400));
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const userRole = req.user?.role?.toLowerCase();

    // 🔹 Build query
    const query: any = { companyId };

    // Only regular users see their own contributions
    if (!['hr', 'admin'].includes(userRole!)) {
      query.user = req.user?._id;
    }

    if (req.query.year) query.year = parseInt(req.query.year);
    if (req.query.month) query.month = parseInt(req.query.month);

    // 🔹 Fetch paginated contributions
    const [contributions, total] = await Promise.all([
      CooperativeContribution.find(query)
        .populate('user', 'staffId firstName lastName department')
        .populate('companyId', 'name')
        .sort({ year: -1, month: -1 })
        .skip(skip)
        .limit(limit),
      CooperativeContribution.countDocuments(query),
    ]);

    // 🔹 Aggregations (apply same access rules)
    const matchBase: any = { companyId, status: { $in: ['APPROVED', 'COLLECTED'] } };
    if (!['hr', 'admin'].includes(userRole!)) {
      matchBase.user = req.user?._id;
    }

    const lifetimeAgg = await CooperativeContribution.aggregate([
      { $match: matchBase },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);

    const activeAgg = await CooperativeContribution.aggregate([
      { $match: { ...matchBase, status: 'APPROVED' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);

    const lifetimeTotal = lifetimeAgg[0]?.total || 0;
    const activeBalance = activeAgg[0]?.total || 0;

    return res.status(200).json({
      success: true,
      data: {
        data: contributions,
        pagination: { total, page, limit, pages: Math.ceil(total / limit) },
        count: contributions.length,
        totals: {
          lifetimeTotal,
          activeBalance,
        },
      },
    });
  },
);
