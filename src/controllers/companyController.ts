import { NextFunction } from 'express';
import Company, { ICompany } from '../models/Company';
import User, { IUser } from '../models/user.model';
import ErrorResponse from '../utils/ErrorResponse';
import { createActivationLink } from '../utils/passwordValidator';
import { AdminUserData, CompanyData, CreateCompanyDTO, EmailDTO, UserData } from '../types/auth';
import { TypedRequest } from '../types/typedRequest';
import { TypedResponse } from '../types/typedResponse';
import { accessToken } from './authController';
import { sendEmail } from '../utils/emailUtil';
import jwt from 'jsonwebtoken';
import { logAudit } from '../utils/logAudit';
import { asyncHandler } from '../middleware/asyncHandler';
import { sendNotification } from '../utils/sendNotification';
import mongoose from 'mongoose';

export const createCompanyWithAdmin = asyncHandler(
  async (
    req: TypedRequest<{}, {}, CreateCompanyDTO>,
    res: TypedResponse<AdminUserData>,
    next: NextFunction,
  ) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const { companyName, companyDescription, adminData, branding } = req.body;

      if (!companyName || !adminData) {
        await session.abortTransaction();
        return next(new ErrorResponse('Company name and admin data are required', 400));
      }

      // 🔍 Check if the company already exists
      const existingCompany = await Company.findOne({ name: companyName });
      if (existingCompany) {
        await session.abortTransaction();
        return next(new ErrorResponse('Company already exists', 400));
      }

      // 🔍 Check if the email already exists
      const existingEmail = await User.findOne({
        email: adminData.email.toLowerCase().trim(),
      });
      if (existingEmail) {
        await session.abortTransaction();
        return next(
          new ErrorResponse(
            'Email is already registered. Please use a different email address.',
            400,
          ),
        );
      }

      // 🏢 Create company (inside transaction)
      const company = await Company.create(
        [
          {
            name: companyName,
            description: companyDescription || '',
            roles: 'admin',
            department: 'admin',
            status: 'active',
            branding: {
              displayName: branding?.displayName || companyName,
              logoUrl: branding?.logoUrl || '',
              primaryColor: branding?.primaryColor || '#030577ab',
            },
          },
        ],
        { session },
      ).then((res) => res[0]);

      // 👤 Create admin user (inside transaction)
      const adminUser = await User.create(
        [
          {
            staffId: adminData.staffId,
            title: adminData.title,
            gender: adminData.gender,
            firstName: adminData.firstName,
            lastName: adminData.lastName,
            middleName: adminData.middleName,
            email: adminData.email.toLowerCase().trim(),
            role: 'admin',
            department: 'admin',
            company: company._id,
            status: 'active',
          },
        ],
        { session },
      ).then((res) => res[0]);

      // 🔐 Generate tokens
      const { activationCode, token } = accessToken(adminUser);
      const activationLink = createActivationLink(token);
      const decoded = jwt.decode(token) as { exp: number };

      if (!decoded?.exp) {
        await session.abortTransaction();
        return next(new ErrorResponse('Invalid token or missing expiration', 500));
      }

      const expiryTimestamp = decoded.exp * 1000;
      const minutesLeft = Math.ceil((expiryTimestamp - Date.now()) / (60 * 1000));
      const currentYear = new Date().getFullYear();

      // 📩 Send activation notification (email + notification system)
      await sendNotification({
        user: adminUser,
        type: 'ACCOUNT_ACTIVATION',
        title: 'Activate Your Account',
        message: 'Your company admin account has been created. Please activate it.',
        emailSubject: 'Activate Your Account',
        emailTemplate: 'loginAdmin-link.ejs',
        emailData: {
          activationLink,
          expiresAt: `in ${minutesLeft} minute${minutesLeft !== 1 ? 's' : ''}`,
          defaultPassword: activationCode,
          companyName: company?.branding?.displayName || company?.name,
          logoUrl: company?.branding?.logoUrl,
          primaryColor: company?.branding?.primaryColor || '#0621b6b0',
          currentYear,
        },
      });

      // 📝 Log audit
      await logAudit({
        userId: adminUser.id,
        action: 'ROLE_CREATED',
        status: 'SUCCESS',
        ip: req.ip,
        userAgent: req.get('user-agent'),
      });

      // ✅ Commit transaction if everything succeeded
      await session.commitTransaction();

      const companyObj: CompanyData = {
        id: company.id.toString(),
        name: company.name,
        description: company.description || '',
        roles: 'admin',
        status: 'active',
        department: company.department,
      };

      const adminUserObj: UserData = {
        id: adminUser.id.toString(),
        email: adminUser.email,
        role: adminUser.role,
        department: adminUser.department,
        token,
      };

      res.status(201).json({
        success: true,
        message: 'Company and admin created successfully. Activation email sent.',
        data: {
          company: companyObj,
          adminUser: adminUserObj,
        },
      });
    } catch (err) {
      // ❌ Rollback on any error
      await session.abortTransaction();
      next(err);
    } finally {
      session.endSession();
    }
  },
);

// export const resendActivationLink = asyncHandler(
//   async (
//     req: TypedRequest<{}, {}, EmailDTO>,
//     res: TypedResponse<{ user: IUser }>,
//     next: NextFunction,
//   ) => {
//     const { email } = req.body;
//     const company = req.company;

//     if (!email) {
//       return next(new ErrorResponse('Email is required to resend activation link', 400));
//     }

//     // 🔹 Find user by email + company
//     const user = (await User.findOne({
//       email: email.toLowerCase().trim(),
//       company: company?._id,
//     }).populate('company')) as unknown as IUser & { company: ICompany };

//     if (!user) {
//       return next(new ErrorResponse('User not found for this company', 404));
//     }

//     // 🔹 Generate new activation token
//     const { activationCode, token } = accessToken(user);

//     // Decode token for expiry
//     const decoded = jwt.decode(token) as { exp: number };
//     if (!decoded?.exp) {
//       return next(new ErrorResponse('Invalid token or missing expiration', 500));
//     }

//     const expiryTimestamp = decoded.exp * 1000;
//     const minutesLeft = Math.ceil((expiryTimestamp - Date.now()) / (60 * 1000));
//     const expiresAt = `in ${minutesLeft} minute${minutesLeft !== 1 ? 's' : ''}`;
//     const currentYear = new Date().getFullYear();

//     // 🔹 Prepare email data
//     const emailData = {
//       name: user.firstName,
//       activationLink: createActivationLink(token),
//       expiresAt,
//       defaultPassword: activationCode,
//       companyName: user.company?.branding?.displayName || user.company?.name,
//       logoUrl: user.company?.branding?.logoUrl,
//       primaryColor: user.company?.branding?.primaryColor || '#0621b6b0',
//       currentYear,
//     };

//     // 🔹 Send email
//     const emailSent = await sendEmail(
//       user.email,
//       'Activate Your Account',
//       'loginAdmin-link.ejs',
//       emailData,
//     );

//     if (!emailSent) {
//       return next(new ErrorResponse('Failed to resend activation email', 500));
//     }

//     // Update user invite status
//     await User.findByIdAndUpdate(user._id, { sendInvite: true }, { new: true });

//     // Log action
//     await logAudit({
//       userId: user.id,
//       action: 'RESEND_ACTIVATION_LINK',
//       status: 'SUCCESS',
//       ip: req.ip,
//       userAgent: req.get('user-agent'),
//     });

//     const updatedUser = await User.findByIdAndUpdate(
//       user._id,
//       { sendInvite: false },
//       { new: true },
//     );

//     if (!updatedUser) {
//       return next(new ErrorResponse('Failed to retrieve updated user data', 500));
//     }

//     res.status(200).json({
//       success: true,
//       message: 'New activation email has been sent.',
//       data: { user: updatedUser },
//     });
//   },
// );

export const resendActivationLink = asyncHandler(
  async (
    req: TypedRequest<{}, {}, EmailDTO>,
    res: TypedResponse<{ user: IUser }>,
    next: NextFunction,
  ) => {
    const { email } = req.body;

    if (!email) {
      return next(new ErrorResponse('Email is required to resend activation link', 400));
    }

    // Find the user by email
    // const user = await User.findOne({ email: email.toLowerCase().trim() }).populate<{company: ICompany}>("company");
    const user = (await User.findOne({ email: email.toLowerCase().trim() }).populate(
      'company',
    )) as unknown as IUser & { company: ICompany };

    if (!user) {
      return next(new ErrorResponse('User not found', 404));
    }

    // Generate a new activation token
    // const { activationCode, token } = createActivationToken(user);
    const { activationCode, token } = accessToken(user);

    // Decode the token to get the expiration time
    const decoded = jwt.decode(token) as { exp: number };
    if (!decoded || !decoded.exp) {
      return next(new ErrorResponse('Invalid token or missing expiration', 500));
    }

    // Calculate the expiration time in a human-readable format
    const expiryTimestamp = decoded.exp * 1000; // Convert from seconds to milliseconds
    const minutesLeft = Math.ceil((expiryTimestamp - Date.now()) / (60 * 1000));
    const expiresAt = `in ${minutesLeft} minute${minutesLeft !== 1 ? 's' : ''}`;
    const currentYear = new Date().getFullYear();
    // await redisClient.set(
    //   `2fa:${user.email}`,
    //   JSON.stringify({ code: activationCode, token }),
    //   'EX',
    //   1800 // 30 minutes
    // );
    // Prepare email data
    const emailData = {
      name: user.firstName,
      activationLink: createActivationLink(token),
      expiresAt,
      defaultPassword: activationCode,

      companyName: user.company?.branding?.displayName || user.company?.name,
      logoUrl: user.company?.branding?.logoUrl,
      primaryColor: user.company?.branding?.primaryColor || '#0621b6b0',
      currentYear,
    };

    // Send the activation email again
    const emailSent = await sendEmail(
      user.email,
      'Activate Your  Account',
      'loginAdmin-link.ejs', // EJS template for the activation link
      emailData,
    );

    if (!emailSent) {
      return next(new ErrorResponse('Failed to resend activation email', 500));
    }

    // await User.findByIdAndUpdate(user._id, { sendInvite: true }, { new: true });
        // ✅ RESET SECURITY STATE (AFTER EMAIL SUCCESS)
      await User.findByIdAndUpdate(
        user._id,
        {
          sendInvite: true,
          resetRequested: false,
          resetRequestedAt: undefined,
          failedLoginAttempts: 0,
          lockUntil: undefined,
        },
        { new: true },
      );


    // Log the action
    await logAudit({
      userId: user.id,
      action: 'RESEND_ACTIVATION_LINK',
      status: 'SUCCESS',
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    const updatedUser = await User.findByIdAndUpdate(
      user._id,
      { sendInvite: false },
      { new: true },
    );
    if (!updatedUser) {
      return next(new ErrorResponse('Failed to retrieve updated user data', 500));
    }

    res.status(200).json({
      success: true,
      message: 'New activation email has been sent.',
      data: {
        user: updatedUser,
      },
    });
  },
);
