
import { NextFunction } from 'express';
import { TypedRequest } from '../types/typedRequest';
import { TypedResponse } from '../types/typedResponse';
import { uploadToCloudinary } from '../utils/cloudinary';
import ErrorResponse from '../utils/ErrorResponse';
import { redisClient } from '../utils/redisClient';
import User, {IUser} from '../models/user.model'
import { asyncHandler } from '../middleware/asyncHandler';
import { UserListResponse } from '../types/auth';

import { Types } from 'mongoose';

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

export const getMyProfile = asyncHandler(async (
  req: TypedRequest<{}, {}, {}>,
  res: TypedResponse<{ user: IUser }>,
  next: NextFunction
) => {
  try {
    const userId = req.user?._id;
    const companyId = req.company?._id;

    if (!userId || !companyId) {
      return next(new ErrorResponse('Unauthorized or missing company context', 403));
    }

    const user = await User.findOne({ _id: userId, company: companyId }).select('-password');

    if (!user) {
      return next(new ErrorResponse('User not found in your company', 404));
    }

    return res.status(200).json({
      success: true,
      data: {
        user,
      },
    });
  } catch (err: any) {
    next(new ErrorResponse(err.message, 500));
  }
});

// export const getMyProfile = asyncHandler(async (
//   req: TypedRequest<{}, {}, {}>,
//   res: TypedResponse<IUser | any>,
//   next: NextFunction
// ) => {
//   try {
//     const userId = req.user?._id;
//     // const redisKey = `session:${userId}`;

//     // const cachedSession = await redisClient.get(redisKey);

//     // if (cachedSession) {
//     //   const sessionData = JSON.parse(cachedSession);

//     //   await redisClient.expire(redisKey, 60 * 60 * 24); // optional sliding window

//     //   return res.status(200).json({
//     //     success: true,
//     //     data: {
//     //       user: sessionData, // wrapped!
//     //     },
//     //   });
//     // }

//     const user = await User.findById(userId).select('-password');
//     if (!user) {
//       return next(new ErrorResponse('User not found', 404));
//     }

//     //  await redisClient.setex(redisKey, 60 * 60 * 24, JSON.stringify(user.toObject()));

//     return res.status(200).json({
//       success: true,
//       data: {
//         user, // wrapped!
//       },
//     });
//   } catch (err: any) {
//     next(new ErrorResponse(err.message, 500));
//   }
// });




export const updateMyProfile = async (
  req: TypedRequest<{}, {}, Partial<IUser>>,  // Typing request body as Partial<IUser>
  res: TypedResponse<IUser>,
  next: NextFunction
) => {
  try {
    let updates: Partial<IUser> = req.body;  
    const { user } = req; 

    
    if (user?.role !== 'admin' && user?.role !== 'hr') {
      const allowedFields = ['workExperience', 'emergencyContact', 'address', 'profileImage', 'phoneNumber'];
      
      const filteredUpdates = Object.keys(updates).reduce((acc, key) => {
        if (allowedFields.includes(key)) {
          acc[key as keyof Partial<IUser>] = updates[key as keyof Partial<IUser>];
        }
        return acc;
      }, {} as Partial<IUser>);

      if (Object.keys(filteredUpdates).length === 0) {
        return next(new ErrorResponse('You are not allowed to update any fields', 403));
      }


      updates = filteredUpdates;  
    }

    // Find the user and update their profile
    const userToUpdate = await User.findByIdAndUpdate(req.user?._id, updates, { new: true, runValidators: true }).select('-password');

    if (!userToUpdate) {
      return next(new ErrorResponse('User not found', 404));
    }

    res.status(200).json({ success: true, data: userToUpdate });
  } catch (err: any) {
    next(new ErrorResponse(err.message, 500));
  }
};


// Upload Profile Picture
export const uploadProfilePicture =asyncHandler (async (
  req: TypedRequest<{}, {}, {}>,
  res: TypedResponse<{ profileImage: string }>,
  next: NextFunction
) => {
 
  try {
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
  } catch (err: any) {
    next(new ErrorResponse(err.message, 500));
  }
});



export const getAllUsers = asyncHandler(async (
  req: TypedRequest,
  res: TypedResponse<UserListResponse>,
  next: NextFunction
) => {
  try {
    const companyId = req.company?._id;

    if (!companyId) {
      return next(new ErrorResponse('Invalid company context', 400));
    }

    const users = await User.find({ company: companyId }).select('-password');

    res.status(200).json({
      success: true,
      data: {
        data: users,
        count: users.length,
      },
    });
  } catch (err: any) {
    next(new ErrorResponse(err.message, 500));
  }
});


// Delete Employee (Admin/HR Only)


export const deleteEmployee = async (
  req: TypedRequest<{ id: string }, {}, {}>,
  res: TypedResponse<{}>,
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

