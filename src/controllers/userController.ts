
import { NextFunction } from 'express';
import { TypedRequest } from '../types/typedRequest';
import { TypedResponse } from '../types/typedResponse';
import { uploadToCloudinary } from '../utils/cloudinary';
import ErrorResponse from '../utils/ErrorResponse';
import { redisClient } from '../utils/redisClient';
import User, {IUser} from '../models/user.model'
import { asyncHandler } from '../middleware/asyncHandler';
import { PaginatedProfilesResponse, UserListResponse } from '../types/auth';

import { Types } from 'mongoose';
import { IOnboardingRequirement, OnboardingRequirement } from '../models/OnboardingRequirement';
import PayrollNew from '../models/PayrollNew';
import { calculatePayroll } from '../utils/payrollCalculator';
import LeaveBalance from '../models/LeaveBalance';


export const getMyProfile = asyncHandler(async (
  req: TypedRequest<{}, {}, {}>,
  res: TypedResponse<{ user: IUser }>,
  next: NextFunction
) => {
  const userId = req.user?._id;
  const companyId = req.company?._id;

  if (!userId || !companyId) {
    return next(new ErrorResponse('Unauthorized or missing company context', 403));
  }

  const user = await User.findOne({ _id: userId, company: companyId }).select('-password');

  if (!user) {
    return next(new ErrorResponse('User not found in your company', 404));
  }

  res.status(200).json({
    success: true,
    data: { user },
  });
});




export const updateMyProfile = async (
  req: TypedRequest<{ id: string }, {}, Partial<IUser>>,
  res: TypedResponse<IUser>,
  next: NextFunction
) => {
  try {
    const { user } = req;
    const updates = req.body;
    const targetUserId = req.params.id;

    if (!targetUserId) {
      return next(new ErrorResponse('User ID is required in the URL for updating a profile', 400));
    }

    if (!['admin', 'hr'].includes(user?.role || '')) {
      return next(new ErrorResponse('Not authorized to perform this action', 403));
    }

    // Extract sensitive or non-updatable fields
    const { email, password, staffId, requirements, ...restUpdates } = updates;

    // Filter out undefined values safely
    const filteredUpdates: Partial<IUser> = {};
    (Object.keys(restUpdates) as Array<keyof typeof restUpdates>).forEach((key) => {
      const value = restUpdates[key];
      if (value !== undefined) {
        filteredUpdates[key as keyof IUser] = value as any;
      }
    });

    // Update the user
    const updatedUser = await User.findByIdAndUpdate(
      targetUserId,
      filteredUpdates,
      { new: true, runValidators: true }
    ).select('-password');

    if (!updatedUser) {
      return next(new ErrorResponse('User not found', 404));
    }

    // Update onboarding requirements if included
    if (requirements?.length) {
      for (const reqItem of requirements) {
        await OnboardingRequirement.findOneAndUpdate(
          { employee: targetUserId, department: reqItem.department },
          { tasks: reqItem.tasks },
          { new: true, upsert: true }
        );
      }
    }

    // Recalculate payroll if financial info changed
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
        { new: true, upsert: true }
      );
    }

    return res.status(200).json({ success: true});
  } catch (err: any) {
    return next(new ErrorResponse(err.message, 500));
  }
};


export const uploadProfilePicture =asyncHandler (async (
  req: TypedRequest<{}, {}, {}>,
  res: TypedResponse<{ profileImage: string }>,
  next: NextFunction
) => {
  if (!req.file) {
    return next(new ErrorResponse('No file uploaded', 400));
  }

  const result = await uploadToCloudinary(req.file.buffer, 'btm/documents', 'auto', 'btmlimited');

  const user = await User.findByIdAndUpdate(
    req.user?._id,
    { profileImage: result.secure_url },
    { new: true }
  ).select('-password');

  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }

  res.status(200).json({ success: true, data: { profileImage: result.secure_url } });
});




// export const getAllUsers = asyncHandler(async (
//   req: TypedRequest<{}, { page?: string; limit?: string }, {}>,
//   res: TypedResponse<PaginatedProfilesResponse>,
//   next: NextFunction
// ) => {
//   const companyId = req.company?._id;
//   if (!companyId) {
//     return next(new ErrorResponse("Invalid company context", 400));
//   }

//   const page = parseInt(req.query.page ?? "1", 10);
//   const limit = parseInt(req.query.limit ?? "100", 10);
//   const skip = (page - 1) * limit;

//   const [users, total] = await Promise.all([
//     User.find({ company: companyId })
//       .select("-password")
//       .skip(skip)
//       .limit(limit)
//       .populate({
//         path: "requirements",
//         model: "OnboardingRequirement",
//       })
//       .lean({ virtuals: true }),
//     User.countDocuments({ company: companyId }),
//   ]);

//   // get all leave balances for these users in bulk
//   const userIds = users.map(u => u._id);
//   const leaveBalances = await LeaveBalance.find({
//     user: { $in: userIds },
//     company: companyId,
//     year: new Date().getFullYear(), // only this year’s balance
//   }).lean();

//   // create quick lookup by userId
//   const leaveMap = new Map(
//     leaveBalances.map(lb => [lb.user.toString(), lb])
//   );

//   // attach leave balance to each user
//   const usersWithBalances = users.map(u => ({
//     ...u,
//     leaveBalance: leaveMap.get(u._id.toString()) ?? {
//       balances: { annual: 0, compassionate: 0, maternity: 0 },
//       year: new Date().getFullYear(),
//     },
//   }));

//   const pages = Math.ceil(total / limit);

//   res.status(200).json({
//     success: true,
//     data: {
//       data: usersWithBalances,
//       pagination: { total, page, limit, pages },
//       count: users.length,
//     },
//   });
// });
export const getAllUsers = asyncHandler(
  async (
    req: TypedRequest<{}, { page?: string; limit?: string }, {}>,
    res: TypedResponse<PaginatedProfilesResponse>,
    next: NextFunction
  ) => {
    const companyId = req.company?._id;
    if (!companyId) {
      return next(new ErrorResponse("Invalid company context", 400));
    }

    const page = parseInt(req.query.page ?? "1", 10);
    const limit = parseInt(req.query.limit ?? "100", 10);
    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      User.find({ company: companyId })
        .select("-password")
        .skip(skip)
        .limit(limit)
        .populate({
          path: "requirements",
          model: "OnboardingRequirement",
        })
        .populate('company')
        .lean({ virtuals: true }),
      User.countDocuments({ company: companyId }),
    ]);

    // get all leave balances for these users in bulk
    const userIds = users.map((u) => u._id);
    const leaveBalances = await LeaveBalance.find({
      user: { $in: userIds },
      company: companyId,
      year: new Date().getFullYear(), // only this year’s balance
    }).lean();

    // create quick lookup by userId
    const leaveMap = new Map(leaveBalances.map((lb) => [lb.user.toString(), lb]));

    // attach leave balance to each user
    const usersWithBalances = users.map((u) => ({
      ...u,
      leaveBalance:
        leaveMap.get(u._id.toString()) ?? {
          balances: { annual: 0, compassionate: 0, maternity: 0 },
          year: new Date().getFullYear(),
        },
    }));

    const pages = Math.ceil(total / limit);

    res.status(200).json({
      success: true,
      data: {
        data: usersWithBalances,
        pagination: { total, page, limit, pages },
        count: users.length,
      },
    });
  }
);

export const terminateEmployee = async (
  req: TypedRequest<{id: string},  {}, {}>,
  res: TypedResponse<{message: string}>,
  next: NextFunction
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
      { $set: { status: 'inactive', terminationDate: new Date() } }
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
  req: TypedRequest<{id: string},  {}, {}>,
  res: TypedResponse<{message: string}>,
  next: NextFunction
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
      { $set: { status: 'active', terminationDate: null } }
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
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const companyId = req.company?._id;

    if (!Types.ObjectId.isValid(id)) {
      return next(new ErrorResponse('Invalid user ID', 400));
    }

    const user = await User.findOne({ _id: id, company: companyId });
    if (!user) {
      return next(new ErrorResponse('User not found or does not belong to your company', 404));
    }

    if (!['admin', 'hr'].includes(req.user?.role || '')) {
      return next(new ErrorResponse('Access denied', 403));
    }

    await user.deleteOne();
    await redisClient.del(`session:${user._id}`);

    res.status(200).json({ success: true, message: 'User deleted' });
  } catch (err: any) {
    next(new ErrorResponse(err.message, 500));
  }
};

