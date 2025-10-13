import { NextFunction } from 'express';
import { TypedRequest } from '../types/typedRequest';
import { TypedResponse } from '../types/typedResponse';
import { uploadToCloudinary } from '../utils/cloudinary';
import ErrorResponse from '../utils/ErrorResponse';
import { redisClient } from '../utils/redisClient';
import User, { IUser } from '../models/user.model';
import { asyncHandler } from '../middleware/asyncHandler';
import { IUserWithBalance, PaginatedProfilesResponse } from '../types/auth';

import mongoose, { Types } from 'mongoose';
import { OnboardingRequirement } from '../models/OnboardingRequirement';
import PayrollNew from '../models/PayrollNew';
import { calculatePayroll } from '../utils/payrollCalculator';
import LeaveBalance from '../models/LeaveBalance';

export const getMyProfile = asyncHandler(
  async (
    req: TypedRequest<{}, {}, {}>,
    res: TypedResponse<{ user: IUserWithBalance }>,
    next: NextFunction,
  ) => {
    const userId = req.user?._id;
    const companyId = req.company?._id;

    if (!userId || !companyId) {
      return next(new ErrorResponse('Unauthorized or missing company context', 403));
    }

    const user = await User.findOne({ _id: userId, company: companyId })
      .select('-password')
      .populate('requirements')
      .populate('company')
      .lean({ virtuals: true });

    if (!user) {
      return next(new ErrorResponse('User not found in your company', 404));
    }

    const currentYear = new Date().getFullYear();
    const leaveBalance = await LeaveBalance.findOne({
      user: userId,
      company: companyId,
      year: currentYear,
    }).lean();

    const userWithBalance: IUserWithBalance = {
      ...user,
      leaveBalance: leaveBalance ?? {
        balances: { annual: 0, compassionate: 0, maternity: 0 },
        year: currentYear,
      },
    };

    res.status(200).json({
      success: true,
      data: { user: userWithBalance },
    });
  },
);

export const updateMyProfile = async (
  req: TypedRequest<{ id: string }, {}, Partial<IUser>>,
  res: TypedResponse<IUser>,
  next: NextFunction,
) => {
  try {
    const { user } = req;
    const updates = req.body;
    const targetUserId = req.params.id;
    const companyId = req.company?._id;

    if (!targetUserId) {
      return next(new ErrorResponse('User ID is required in the URL for updating a profile', 400));
    }

    if (!['admin', 'hr'].includes(user?.role || '')) {
      return next(new ErrorResponse('Not authorized to perform this action', 403));
    }

    const { email, password, staffId, requirements, nextOfKin, ...restUpdates } = updates;

    const filteredUpdates: Partial<IUser> = {};
    (Object.keys(restUpdates) as Array<keyof typeof restUpdates>).forEach((key) => {
      const value = restUpdates[key];
      if (value !== undefined) {
        filteredUpdates[key as keyof IUser] = value as any;
      }
    });

    if (nextOfKin !== undefined) {
      filteredUpdates.nextOfKin = nextOfKin;
    }

    const updatedUser = await User.findOneAndUpdate(
      { _id: targetUserId, company: companyId },
      filteredUpdates,
      { new: true, runValidators: true },
    ).select('-password');

    if (!updatedUser) {
      return next(new ErrorResponse('User not found', 404));
    }

    if (requirements?.length) {
      for (const reqItem of requirements) {
        await OnboardingRequirement.findOneAndUpdate(
          { employee: targetUserId, department: reqItem.department },
          { tasks: reqItem.tasks },
          { new: true, upsert: true },
        );
      }
    }

    const originalUser = await User.findById(targetUserId);
    const hasFinancialChange =
      originalUser?.accountInfo?.basicPay !== updates.accountInfo?.basicPay ||
      originalUser?.accountInfo?.allowances !== updates.accountInfo?.allowances;

    if (hasFinancialChange) {
      const payrollResult = calculatePayroll({
        basicSalary: updates.accountInfo?.basicPay || 0,
        totalAllowances: updates.accountInfo?.allowances || 0,
      });

      await PayrollNew.findOneAndUpdate(
        { user: targetUserId },
        {
          basicSalary: updates.accountInfo?.basicPay,
          totalAllowances: updates.accountInfo?.allowances,
          grossSalary: payrollResult.grossSalary,
          pension: payrollResult.pension,
          CRA: payrollResult.CRA,
          taxableIncome: payrollResult.taxableIncome,
          tax: payrollResult.tax,
          netSalary: payrollResult.netSalary,
          taxBands: payrollResult.taxBands,
        },
        { new: true, upsert: true },
      );
    }

    return res.status(200).json({ success: true });
  } catch (err: any) {
    return next(new ErrorResponse(err.message, 500));
  }
};

export const uploadProfilePicture = asyncHandler(
  async (
    req: TypedRequest<{}, {}, {}>,
    res: TypedResponse<{ profileImage: string }>,
    next: NextFunction,
  ) => {
    if (!req.file) {
      return next(new ErrorResponse('No file uploaded', 400));
    }
    const result = await uploadToCloudinary(req.file.buffer, 'btm/documents', 'auto', 'btmlimited');

    const user = await User.findByIdAndUpdate(
      req.user?._id,
      { profileImage: result.secure_url },
      { new: true },
    ).select('-password');

    if (!user) {
      return next(new ErrorResponse('User not found', 404));
    }

    res.status(200).json({ success: true, data: { profileImage: result.secure_url } });
  },
);

export const getAllUsers = asyncHandler(
  async (
    req: TypedRequest<
      {},
      { page?: string; limit?: string; search?: string; department?: string; status?: string },
      {}
    >,
    res: TypedResponse<PaginatedProfilesResponse>,
    next: NextFunction,
  ) => {
    const companyId = req.company?._id;
    if (!companyId) {
      return next(new ErrorResponse('Invalid company context', 400));
    }

    const page = parseInt(req.query.page ?? '1', 10);
    const limit = parseInt(req.query.limit ?? '50', 10);
    const skip = (page - 1) * limit;

    const search = req.query.search?.trim();
    const department = req.query.department;
    const status = req.query.status;
    // --- Base filters ---
    const filters: any = { company: companyId };

    // Default: only active users unless status explicitly provided
    // if (status) {
    //   filters.status = status;
    // } else {
    //   filters.status = 'active'
    // }

    if (status && status !== 'all') {
      filters.status = status.toLowerCase(); // normalize
    }

    if (search) {
      filters.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }

    if (department && department !== 'all') {
      filters.department = department;
    }

    const [users, total] = await Promise.all([
      User.find(filters)
        .select('-password')
        .skip(skip)
        .limit(limit)
        .populate({
          path: 'requirements',
        })
        .populate('company')
        .lean({ virtuals: true }),
      User.countDocuments(filters),
    ]);

    const userIds = users.map((u) => u._id);
    const leaveBalances = await LeaveBalance.find({
      user: { $in: userIds },
      company: companyId,
      year: new Date().getFullYear(),
    }).lean();

    const leaveMap = new Map(leaveBalances.map((lb) => [lb.user.toString(), lb]));

    const usersWithBalances: IUserWithBalance[] = users.map(
      (u): IUserWithBalance => ({
        ...u,
        leaveBalance: leaveMap.get(u._id.toString()) ?? {
          balances: { annual: 0, compassionate: 0, maternity: 0 },
          year: new Date().getFullYear(),
        },
      }),
    );
    const pages = Math.ceil(total / limit);

    res.status(200).json({
      success: true,
      data: {
        data: usersWithBalances,
        pagination: { total, page, limit, pages },
        count: users.length,
      },
    });
  },
);

export const terminateEmployee = async (
  req: TypedRequest<{ id: string }, {}, {}>,
  res: TypedResponse<{ message: string }>,
  next: NextFunction,
) => {
  try {
    const { id } = req.params;
    const companyId = req.company?._id;

    if (!Types.ObjectId.isValid(id)) {
      return next(new ErrorResponse('Invalid user ID', 400));
    }

    if (!['admin', 'hr'].includes(req.user?.role || '')) {
      return next(new ErrorResponse('Access denied', 403));
    }

    const result = await User.updateOne(
      { _id: id, company: companyId },
      { $set: { status: 'inactive', terminationDate: new Date() } },
    );

    if (result.matchedCount === 0) {
      return next(new ErrorResponse('User not found or does not belong to your company', 404));
    }

    await redisClient.del(`session:${id}`);

    res.status(200).json({ success: true, message: 'User status updated to inactive' });
  } catch (err: any) {
    next(new ErrorResponse(err.message, 500));
  }
};

export const activateEmployee = async (
  req: TypedRequest<{ id: string }, {}, {}>,
  res: TypedResponse<{ message: string }>,
  next: NextFunction,
) => {
  try {
    const { id } = req.params;
    const companyId = req.company?._id;

    if (!Types.ObjectId.isValid(id)) {
      return next(new ErrorResponse('Invalid user ID', 400));
    }

    if (!['admin', 'hr'].includes(req.user?.role || '')) {
      return next(new ErrorResponse('Access denied', 403));
    }

    const result = await User.updateOne(
      { _id: id, company: companyId },
      { $set: { status: 'active', terminationDate: null } },
    );

    if (result.matchedCount === 0) {
      return next(new ErrorResponse('User not found or does not belong to your company', 404));
    }

    res.status(200).json({ success: true, message: 'User activated successfully' });
  } catch (err: any) {
    next(new ErrorResponse(err.message, 500));
  }
};

export const deleteEmployee = async (
  req: TypedRequest<{ id: string }, {}, {}>,
  res: TypedResponse<{ message: string }>,
  next: NextFunction,
) => {
  const session = await mongoose.startSession();

  try {
    const { id } = req.params;
    const companyId = req.company?._id;

    if (!Types.ObjectId.isValid(id)) {
      return next(new ErrorResponse('Invalid user ID', 400));
    }

    const user = await User.findOne({ _id: id, company: companyId }).session(session);
    if (!user) {
      return next(new ErrorResponse('User not found or does not belong to your company', 404));
    }

    if (!['admin', 'hr'].includes(req.user?.role || '')) {
      return next(new ErrorResponse('Access denied', 403));
    }

    // Transaction function
    const transactionFn = async () => {
      // Delete payrolls
      await PayrollNew.deleteMany({ user: user._id, company: companyId }).session(session);

      // Delete user
      await user.deleteOne({ session });

      // Delete Redis session (outside DB transaction)
      await redisClient.del(`session:${user._id}`);
    };

    // Retry transaction up to 3 times
    const MAX_RETRIES = 3;
    let attempt = 0;
    while (attempt < MAX_RETRIES) {
      try {
        await session.withTransaction(transactionFn);
        break; // success
      } catch (err: any) {
        attempt++;
        if (
          attempt < MAX_RETRIES &&
          err.hasOwnProperty('errorLabels') &&
          err.errorLabels.includes('TransientTransactionError')
        ) {
          continue; // retry
        } else {
          throw err; // non-transient error or max retries reached
        }
      }
    }

    session.endSession();

    res.status(200).json({ success: true, message: 'User and payroll deleted successfully' });
  } catch (err: any) {
    await session.abortTransaction();
    session.endSession();
    next(new ErrorResponse(err.message, 500));
  }
};
