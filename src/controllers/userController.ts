"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.activateEmployee = exports.terminateEmployee = exports.deleteEmployee = exports.getAllUsers = exports.uploadProfilePicture = exports.updateMyProfile = exports.getMyProfile = void 0;
const cloudinary_1 = require("../utils/cloudinary");
const ErrorResponse_1 = __importDefault(require("../utils/ErrorResponse"));
const redisClient_1 = require("../utils/redisClient");
const user_model_1 = __importDefault(require("../models/user.model"));
const asyncHandler_1 = require("../middleware/asyncHandler");
const OnboardingRequirement_1 = require("../models/OnboardingRequirement");
const mongoose_1 = require("mongoose");
const payrollCalculator_1 = require("../utils/payrollCalculator");
const PayrollNew_1 = __importDefault(require("../models/PayrollNew"));
// Get My Profile
// export const getMyProfile = asyncHandler(async (
//   req: TypedRequest<{}, {}, {}>,
//   res: TypedResponse<IUser>,
//   next: NextFunction
// ) => {
//   try {
//     const user = await User.findById(req.user?._id).select('-password');
//     if (!user) {
//       return next(new ErrorResponse('User not found', 404));
//     }
//     res.status(200).json({ success: true, data: user });
//   } catch (err: any) {
//     next(new ErrorResponse(err.message, 500));
//   }
// });
exports.getMyProfile = (0, asyncHandler_1.asyncHandler)(async (req, res, next) => {
    try {
        const userId = req.user?._id;
        const companyId = req.company?._id;
        if (!userId || !companyId) {
            return next(new ErrorResponse_1.default('Unauthorized or missing company context', 403));
        }
        const user = await user_model_1.default.findOne({ _id: userId, company: companyId }).select('-password');
        if (!user) {
            return next(new ErrorResponse_1.default('User not found in your company', 404));
        }
        return res.status(200).json({
            success: true,
            data: {
                user,
            },
        });
    }
    catch (err) {
        next(new ErrorResponse_1.default(err.message, 500));
    }
});
// export const updateMyProfile = async (
//   req: TypedRequest<{}, {}, Partial<IUser>>,
//   res: TypedResponse<IUser>,
//   next: NextFunction
// ) => {
//   try {
//     const { user } = req;
//     let updates: Partial<IUser> = req.body;
//     const isAdminOrHR = user?.role === 'admin' || user?.role === 'hr';
//     const targetUserId = isAdminOrHR && updates._id ? updates._id : user?._id;
//     // Don't allow updating email
//     if ('email' in updates) {
//       delete updates.email;
//     }
//     // Restrict regular users to certain fields only
//     if (!isAdminOrHR) {
//       const allowedFields = [
//         'workExperience',
//         'emergencyContact',
//         'address',
//         'profileImage',
//         'phoneNumber',
//       ];
//       updates = Object.keys(updates).reduce((acc, key) => {
//         if (allowedFields.includes(key)) {
//           acc[key as keyof Partial<IUser>] = updates[key as keyof Partial<IUser>];
//         }
//         return acc;
//       }, {} as Partial<IUser>);
//       if (Object.keys(updates).length === 0) {
//         return next(new ErrorResponse('You are not allowed to update any fields', 403));
//       }
//     }
//     const updatedUser = await User.findByIdAndUpdate(targetUserId, updates, {
//       new: true,
//       runValidators: true,
//     }).select('-password');
//     if (!updatedUser) {
//       return next(new ErrorResponse('User not found', 404));
//     }
//     res.status(200).json({ success: true, data: updatedUser });
//   } catch (err: any) {
//     next(new ErrorResponse(err.message || 'Server error', 500));
//   }
// };
// Upload Profile Picture
// For admin/HR users to edit a staff member's profile
// export const updateMyProfile = asyncHandler(async (req: TypedRequest<{}, {}, InviteUserDTO>, res: TypedResponse<IUser>, next: NextFunction) => {
//   const { user } = req;
//   const updates:  Partial<InviteUserDTO> = req.body;
//   if (user?.role !== 'admin' && user?.role !== 'hr') {
//     return next(new ErrorResponse('Not authorized to perform this action', 403));
//   }
//   const targetUserId = updates._id; 
//   if (!targetUserId) {
//     return next(new ErrorResponse('User ID is required for updating a profile', 400));
//   }
//   const { email, password, staffId, ...updatesToApply } = updates;
//   const updatedUser = await User.findByIdAndUpdate(
//     targetUserId,
//     updatesToApply,
//     { new: true, runValidators: true }
//   ).select('-password');
//   if (!updatedUser) {
//     return next(new ErrorResponse('User not found', 404));
//   }
//   if (updates.requirements && updates.requirements.length > 0) {
//     for (const req of updates.requirements) {
//       await OnboardingRequirement.findOneAndUpdate(
//         { employee: targetUserId, department: req.department },
//         { tasks: req.tasks },
//         { new: true, upsert: true }
//       );
//     }
//   }
//   const originalUser = await User.findById(targetUserId);
//   const hasFinancialChange =
//     originalUser?.accountInfo?.basicPay !== updates.accountInfo?.basicPay ||
//     originalUser?.accountInfo?.allowances !== updates.accountInfo?.allowances;
//   if (hasFinancialChange) {
//     const payrollResult = calculatePayroll({
//       basicSalary: updates.accountInfo?.basicPay || 0,
//       totalAllowances: updates.accountInfo?.allowances || 0,
//     });
//     await PayrollNew.findOneAndUpdate(
//       { user: targetUserId },
//       {
//         basicSalary: updates.accountInfo?.basicPay,
//         totalAllowances: updates.accountInfo?.allowances,
//         grossSalary: payrollResult.grossSalary,
//         pension: payrollResult.pension,
//         CRA: payrollResult.CRA,
//         taxableIncome: payrollResult.taxableIncome,
//         tax: payrollResult.tax,
//         netSalary: payrollResult.netSalary,
//         taxBands: payrollResult.taxBands,
//       },
//       { new: true, upsert: true }
//     );
//   }
//   res.status(200).json({ success: true, data: updatedUser });
// });
exports.updateMyProfile = (0, asyncHandler_1.asyncHandler)(async (req, res, next) => {
    const { user } = req;
    const updates = req.body;
    // 1. Get the target user ID from the URL parameters
    const targetUserId = req.params.id;
    if (!targetUserId) {
        return next(new ErrorResponse_1.default('User ID is required in the URL for updating a profile', 400));
    }
    // 2. Access Control
    if (user?.role !== 'admin' && user?.role !== 'hr') {
        return next(new ErrorResponse_1.default('Not authorized to perform this action', 403));
    }
    // 3. Security: Use destructuring to safely exclude protected fields
    const { email, password, staffId, ...updatesToApply } = updates;
    // 4. Update the main user document using the cleaned payload
    const updatedUser = await user_model_1.default.findByIdAndUpdate(targetUserId, updatesToApply, { new: true, runValidators: true }).select('-password');
    if (!updatedUser) {
        return next(new ErrorResponse_1.default('User not found', 404));
    }
    // 5. Update Onboarding Requirements
    if (updates.requirements && updates.requirements.length > 0) {
        for (const req of updates.requirements) {
            await OnboardingRequirement_1.OnboardingRequirement.findOneAndUpdate({ employee: targetUserId, department: req.department }, { tasks: req.tasks }, { new: true, upsert: true });
        }
    }
    // 6. Recalculate and Update Payroll
    const originalUser = await user_model_1.default.findById(targetUserId);
    const hasFinancialChange = originalUser?.accountInfo?.basicPay !== updates.accountInfo?.basicPay ||
        originalUser?.accountInfo?.allowances !== updates.accountInfo?.allowances;
    if (hasFinancialChange) {
        const payrollResult = (0, payrollCalculator_1.calculatePayroll)({
            basicSalary: updates.accountInfo?.basicPay || 0,
            totalAllowances: updates.accountInfo?.allowances || 0,
        });
        await PayrollNew_1.default.findOneAndUpdate({ user: targetUserId }, {
            basicSalary: updates.accountInfo?.basicPay,
            totalAllowances: updates.accountInfo?.allowances,
            grossSalary: payrollResult.grossSalary,
            pension: payrollResult.pension,
            CRA: payrollResult.CRA,
            taxableIncome: payrollResult.taxableIncome,
            tax: payrollResult.tax,
            netSalary: payrollResult.netSalary,
            taxBands: payrollResult.taxBands,
        }, { new: true, upsert: true });
    }
    res.status(200).json({ success: true, data: updatedUser });
});
exports.uploadProfilePicture = (0, asyncHandler_1.asyncHandler)(async (req, res, next) => {
    try {
        if (!req.file) {
            return next(new ErrorResponse_1.default('No file uploaded', 400));
        }
        const result = await (0, cloudinary_1.uploadToCloudinary)(req.file.buffer, 'btm/documents', 'auto', 'btmlimited');
        const user = await user_model_1.default.findByIdAndUpdate(req.user?._id, { profileImage: result.secure_url }, { new: true }).select('-password');
        if (!user) {
            return next(new ErrorResponse_1.default('User not found', 404));
        }
        res.status(200).json({ success: true, data: { profileImage: result.secure_url } });
    }
    catch (err) {
        next(new ErrorResponse_1.default(err.message, 500));
    }
});
exports.getAllUsers = (0, asyncHandler_1.asyncHandler)(async (req, res, next) => {
    try {
        const companyId = req.company?._id;
        if (!companyId)
            return next(new ErrorResponse_1.default('Invalid company context', 400));
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 100;
        const skip = (page - 1) * limit;
        const [users, total] = await Promise.all([
            user_model_1.default.find({ company: companyId })
                .select('-password')
                .skip(skip)
                .limit(limit)
                .populate("requirements"),
            user_model_1.default.countDocuments({ company: companyId })
        ]);
        const pages = Math.ceil(total / limit);
        res.status(200).json({
            success: true,
            data: {
                data: users,
                pagination: { total, page, limit, pages },
                count: 0
            },
        });
    }
    catch (err) {
        next(new ErrorResponse_1.default(err.message, 500));
    }
});
const deleteEmployee = async (req, res, next) => {
    try {
        const { id } = req.params;
        const companyId = req.company?._id;
        if (!mongoose_1.Types.ObjectId.isValid(id)) {
            return next(new ErrorResponse_1.default('Invalid user ID', 400));
        }
        const user = await user_model_1.default.findOne({ _id: id, company: companyId });
        if (!user) {
            return next(new ErrorResponse_1.default('User not found or does not belong to your company', 404));
        }
        if (!['admin', 'hr'].includes(req.user?.role || '')) {
            return next(new ErrorResponse_1.default('Access denied', 403));
        }
        await user.deleteOne();
        await redisClient_1.redisClient.del(`session:${user._id}`);
        res.status(200).json({ success: true, message: 'User deleted' });
    }
    catch (err) {
        next(new ErrorResponse_1.default(err.message, 500));
    }
};
exports.deleteEmployee = deleteEmployee;
const terminateEmployee = async (req, res, next) => {
    try {
        const { id } = req.params;
        const companyId = req.company?._id;
        // Validate the ID
        if (!mongoose_1.Types.ObjectId.isValid(id)) {
            return next(new ErrorResponse_1.default('Invalid user ID', 400));
        }
        // Check permissions first
        if (!['admin', 'hr'].includes(req.user?.role || '')) {
            return next(new ErrorResponse_1.default('Access denied', 403));
        }
        // Update user status directly, avoiding full validation
        const result = await user_model_1.default.updateOne({ _id: id, company: companyId }, {
            $set: {
                status: 'inactive',
                terminationDate: new Date(),
            },
        });
        if (result.matchedCount === 0) {
            return next(new ErrorResponse_1.default('User not found or does not belong to your company', 404));
        }
        // Remove session data
        await redisClient_1.redisClient.del(`session:${id}`);
        res.status(200).json({ success: true, message: 'User status updated to inactive' });
    }
    catch (err) {
        next(new ErrorResponse_1.default(err.message, 500));
    }
};
exports.terminateEmployee = terminateEmployee;
const activateEmployee = async (req, res, next) => {
    try {
        const { id } = req.params;
        const companyId = req.company?._id;
        if (!mongoose_1.Types.ObjectId.isValid(id)) {
            return next(new ErrorResponse_1.default('Invalid user ID', 400));
        }
        if (!['admin', 'hr'].includes(req.user?.role || '')) {
            return next(new ErrorResponse_1.default('Access denied', 403));
        }
        const result = await user_model_1.default.updateOne({ _id: id, company: companyId }, {
            $set: {
                status: 'active',
                terminationDate: null,
            },
        });
        if (result.matchedCount === 0) {
            return next(new ErrorResponse_1.default('User not found or does not belong to your company', 404));
        }
        res.status(200).json({ success: true, message: 'User activated successfully' });
    }
    catch (err) {
        next(new ErrorResponse_1.default(err.message, 500));
    }
};
exports.activateEmployee = activateEmployee;
