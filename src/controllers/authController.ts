import { NextFunction } from 'express';
import jwt, { JwtPayload, Secret } from 'jsonwebtoken';
import User, { IUser } from '../models/user.model';
import { TypedRequest } from '../types/typedRequest';
import { TypedResponse } from '../types/typedResponse';
import ErrorResponse from '../utils/ErrorResponse';
import { logAudit } from '../utils/logAudit';
import { createActivationLink, generateRandomPassword, PasswordConfig, validatePassword } from '../utils/passwordValidator';
import { redisClient } from '../utils/redisClient';
import { AdminUserData, AuthData, BulkImportResponse, IActivationCode, InviteUserDTO, LoginDTO, RegisterAdminDto, SetPasswordDto, SetupPasswordDTO, SetupPasswordQuery, Verify2FADTO } from '../types/auth';
import { ParsedUser, parseExcelUsers } from '../utils/excelParser';
import { sendEmail } from '../utils/emailUtil';
import { ICompany } from '../models/Company';
import * as XLSX from 'xlsx';
import { sendToken } from '../utils/generateToken';
import { Types } from 'mongoose';
import { isTokenBlacklisted } from '../middleware/auth.middleware';
import { asyncHandler } from '../middleware/asyncHandler';






export const login = asyncHandler(async (req: TypedRequest<{}, {}, LoginDTO>, res: TypedResponse<AuthData>, next: NextFunction) => {
    const { email, password } = req.body; 


    const user = await User.findOne({ email }).select('+password').populate('company') as unknown as IUser & { company: ICompany };
    if (!user || !user.isActive) {
        return next(new ErrorResponse('Invalid credentials or inactive user', 401));
    }
    if (user.lockUntil && user.lockUntil > new Date()) {
        return next(new ErrorResponse('Account locked. Try again later.', 403));
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
        user.failedLoginAttempts++;
        if (user.failedLoginAttempts >= 5) {
            user.lockUntil = new Date(Date.now() + 30 * 60 * 1000);
        }
        await user.save();
        return next(new ErrorResponse('Invalid credentials', 401));
    }

    user.failedLoginAttempts = 0;
    user.lockUntil = undefined;

    // Generate the token and activation code
    const { token, activationCode } = createActivationToken(user); 

    // Decode the token and extract the user information
    const decoded = jwt.decode(token) as { user: { _id: string }; exp: number };

    if (!decoded || !decoded.user || !decoded.user._id || !decoded.exp) {
        return next(new ErrorResponse('Invalid token or missing expiration', 500));
    }

    const expiryTimestamp = decoded.exp * 1000; // Convert from seconds to milliseconds
    const minutesLeft = Math.ceil((expiryTimestamp - Date.now()) / (60 * 1000));
    
    const company = req.company;
    const emailData = {
        name: user.firstName,
        code: activationCode,
        expiresAt: `in ${minutesLeft} minute${minutesLeft !== 1 ? 's' : ''}`,
        companyName: user.company?.branding?.displayName || user.company?.name,
        logoUrl: user.company?.branding?.logoUrl,
        primaryColor: user.company?.branding?.primaryColor || "#0621b6b0",
    };

    await redisClient.set(`2fa:${user.email}`, JSON.stringify({ code: activationCode, token }), 'EX', 1800);


    const emailSent = await sendEmail(
        user.email,
        'Your 2FA Code',
        '2fa-code.ejs', // Ensure this template exists in the correct folder
        emailData
    );

    if (!emailSent) {
        return next(new ErrorResponse('Failed to send 2FA email', 500));
    }

    // Log the audit with the decoded user ID
    await logAudit({
        userId: decoded.user._id, // Use decoded.user._id to access the user ID
        action: 'LOGIN',
        status: 'SUCCESS',
        ip: req.ip,
        userAgent: req.get('user-agent'),
    });
        res.status(200).json({
        success: true,
        message: '2FA code sent to your email',
        data:{
          token
        }
    });

});


export const createActivationToken = (user: IUser): IActivationCode => {
  // const activationCode = Math.floor(1000 + Math.random() * 900000).toString();
  const activationCode = generateRandomPassword(6)

  const token = jwt.sign(
    {
      user,
      activationCode,
    },
    process.env.JWT_SECRET as Secret,
    { expiresIn: "30m" }
  );

  return { activationCode, token };
};

export const accessToken = (user: IUser): IActivationCode => {
  const activationCode = generateRandomPassword(6)

  const token = jwt.sign(
    {
      user,
      activationCode,
    },
    process.env.ACCESS_TOKEN as Secret,
    { expiresIn: "30m" }
  );

  return { activationCode, token };
};


export const registerAdmin = asyncHandler(async (
  req: TypedRequest<{},{}, RegisterAdminDto>,
  res: TypedResponse<AuthData>,
  next: NextFunction
) => {
  const {
    firstName,
    lastName,
    middleName,
    email,
    password,
    role,
    passwordConfig,
  } = req.body;
  // Basic field check
  if (!email || !password || !firstName || !lastName || !role) {
    return next(new ErrorResponse('Missing required fields', 400));
  }

  // Normalize email
  const normalizedEmail = email.trim().toLowerCase();

  // Check for existing user
  const existing = await User.findOne({ email: normalizedEmail });
  if (existing) return next(new ErrorResponse('User already exists', 400));

  // Validate password
  const policy = passwordConfig || {
    minLength: 8,
    requireUppercase: true,
    requireNumber: true,
    requireSpecialChar: true,
  };

  if (!validatePassword(password, policy)) {
    return next(new ErrorResponse('Password does not meet security policy', 400));
  }

  // Create user
  const newUser = await User.create({
    firstName,
    lastName,
    middleName,
    email: normalizedEmail,
    password,
    role,
    isActive: true,
  });

  await logAudit({
    userId: newUser.id,
    action: 'REGISTER_ADMIN',
    status: 'SUCCESS',
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });

  return res.status(201).json({
    success: true,
    message: 'Admin registered successfully',
  });
});


export const verify2FA = asyncHandler(async (
  req: TypedRequest<{} , {},  Verify2FADTO>,
  res: TypedResponse<AuthData>,
  next: NextFunction
) => {
  const { email, code } = req.body;

  const user = await User.findOne({ email });
  if (!user) return next(new ErrorResponse('Invalid user', 400));
  const stored = await redisClient.get(`2fa:${email}`);
  if (!stored) return next(new ErrorResponse('2FA code expired or not found', 400));

  let parsed: { code: string; token: string };
  try {
    parsed = JSON.parse(stored);
    } catch {
    return next(new ErrorResponse('Stored 2FA data is malformed', 500));
  }

  if (parsed.code !== code) {
    return next(new ErrorResponse('Invalid 2FA code', 400));
  }

  // Verify JWT expiration
  try {
    jwt.verify(parsed.token, process.env.JWT_SECRET as Secret);
  } catch (err) {
    return next(new ErrorResponse('2FA token has expired or is invalid', 401));
  }

  // Clean up
  await redisClient.del(`2fa:${email}`);

  // Audit log
  await logAudit({
    userId: user?._id,
    action: 'VERIFY_2FA',
    status: 'SUCCESS',
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  sendToken(user, 200, res, next)
});


// controllers/authController.ts

export const resend2FACode = asyncHandler(async (
  req: TypedRequest<{}, {}, { email: string }>,
  res: TypedResponse<{ message: string }>,
  next: NextFunction
) => {
  const { email } = req.body;

  const user = await User.findOne({ email }).populate('company') as unknown as IUser & { company: ICompany };;
  if (!user || !user.isActive) {
    return next(new ErrorResponse('Invalid or inactive user', 400));
  }

  const { token, activationCode } = createActivationToken(user);

  const decoded = jwt.decode(token) as { user: { _id: string }; exp: number };

  if (!decoded?.user?._id || !decoded.exp) {
    return next(new ErrorResponse('Token decoding failed', 500));
  }

  const expiryTimestamp = decoded.exp * 1000;
  const minutesLeft = Math.ceil((expiryTimestamp - Date.now()) / (60 * 1000));
  const company = req.company;

  const emailData = {
    name: user.firstName,
    code: activationCode,
    expiresAt: `in ${minutesLeft} minute${minutesLeft !== 1 ? 's' : ''}`,
    companyName: user.company?.branding?.displayName || user.company?.name,
    logoUrl: user.company?.branding?.logoUrl,
    primaryColor: user.company?.branding?.primaryColor || "#0621b6b0",
  };

 await redisClient.set(`2fa:${user.email}`, JSON.stringify({ code: activationCode, token }), 'EX', 1800);


  const emailSent = await sendEmail(
    user.email,
    'Your 2FA Code (Resent)',
    '2fa-code.ejs',
    emailData
  );

  if (!emailSent) {
    return next(new ErrorResponse('Failed to send 2FA email', 500));
  }

  await logAudit({
    userId: decoded.user._id,
    action: 'RESEND_2FA_CODE',
    status: 'SUCCESS',
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });

  res.status(200).json({
    message: '2FA code resent successfully',
    success: false
  });
});




export const requestPassword = asyncHandler(async (
  req: TypedRequest<{}, {}, {email: string}>,
  res: TypedResponse<AuthData>,
  next: NextFunction
) => {
  const { email } = req.body;

  if (!email) {
    return next(new ErrorResponse("Email is required", 400));
  }

  const user = await User.findOne({ email });
  if (!user) {
    return next(new ErrorResponse("No user found with that email", 404));
  }

  // Add the email to the resetRequests array if it's not already there
   if (!user.resetRequested) {
    user.resetRequested = true;
    user.resetRequestedAt = new Date(); // Optional
    await user.save();
  }
  // Send email to admin notifying them about the request
  try {
    // const emailData = {
    //   userName: user.firstName,
    //   email: user.email,
    // };

    // const emailSent = await sendEmail(
    //   process.env.SMPT_MAIL!, // Admin's email
    //   "New Password Reset Request",
    //   "password-reset-request.ejs", // Email template to notify admin
    //   emailData
    // );

    // if (!emailSent) {
    //   return next(new ErrorResponse("Failed to notify admin about reset request", 500));
    // }

    // Log the reset request for audit
    await logAudit({
      userId: user._id,
      action: "PASSWORD_RESET_REQUEST",
      status: "PENDING",
      ip: req.ip,
      userAgent: req.get("user-agent"),
    });

    res.status(200).json({
      success: true,
      message: "Password reset request has been sent to the admin. You will be notified once processed.",
    });
  } catch (error) {
    return next(new ErrorResponse("Error processing password reset request", 500));
  }
});



export const sendActivationPasswordLink = asyncHandler(
  async (req: TypedRequest<{}, {}, {email: string}>, res: TypedResponse<AdminUserData>, next: NextFunction) => {
    const { email } = req.body;

    // Validate input
    if (!email) {
      return next(new ErrorResponse('Email is required to resend activation link', 400));
    }

    // Find user by email
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return next(new ErrorResponse('User not found', 404));
    }

    // Generate new access token and activation code
    const { activationCode, token } = accessToken(user); // <-- Updated here

    // Decode token to get expiration
    const decoded = jwt.decode(token) as { exp?: number };
    if (!decoded?.exp) {
      return next(new ErrorResponse('Invalid token or missing expiration', 500));
    }

    const expiryTimestamp = decoded.exp * 1000;
    const minutesLeft = Math.ceil((expiryTimestamp - Date.now()) / (60 * 1000));
    const expiresAt = `in ${minutesLeft} minute${minutesLeft !== 1 ? 's' : ''}`;
    const company = req.company;

    // Prepare email content
    const emailData = {
      name: user.firstName,
      activationLink: createActivationLink(token),
      expiresAt,
      defaultPassword: activationCode,      
    companyName: company?.branding?.displayName || company?.name,
    logoUrl: company?.branding?.logoUrl ,
    primaryColor: company?.branding?.primaryColor || "#0621b6b0",
    };

    // Send the email
    const emailSent = await sendEmail(
      user.email,
      'Activate Your  Account',
      'loginAdmin-link.ejs',
      emailData
    );

    if (!emailSent) {
      return next(new ErrorResponse('Failed to resend activation email', 500));
    }

    // Audit log
    await logAudit({
      userId: user.id,
      action: 'RESEND_ACTIVATION_LINK',
      status: 'SUCCESS',
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });


    res.status(200).json({
      success: true,
      message: 'New activation email has been sent.',
    });
  }
);


export const inviteUser = asyncHandler ( async (req: TypedRequest<{},{}, InviteUserDTO>, res: TypedResponse<AuthData>, next: NextFunction) => {
  
  const company = req.company;
  const companyId = company?._id;
  const userId = req.user?._id;
    const tempBiometry =  generateRandomPassword(8)
    const { firstName, lastName, middleName, email, department, role ,  
      startDate,
      salary,
      phoneNumber,
      dateOfBirth,
      position,
      address 
    } = req.body;

    if (!email || !role || !firstName || !lastName || !department || !startDate || !salary || !phoneNumber || !dateOfBirth || !position || !address) {
      return next(new ErrorResponse('Missing required fields', 400));
    }

    const normalizedEmail = email.toLowerCase().trim();

    const existing = await User.findOne({ email:normalizedEmail  });
    if (existing) return next(new ErrorResponse('User already exists', 400));

    

    // Create the new user with the temporary password (Hashing will happen automatically because of the pre-save hook)
    const newUser = await User.create({
      firstName,
      lastName,
      middleName,
      email:normalizedEmail,
      department,
      biometryId: tempBiometry,
      role,
      isActive: true,
      company: companyId,
      startDate,
      salary,
      phoneNumber,
      dateOfBirth,
      position,
      address,
      status: 'active',
    });

          // Now, generate the activation token and activation link after the user is created
          const {activationCode, token } = accessToken(newUser);  // Passing the actual adminUser object
          const setupLink = createActivationLink(token);
          
      
          // Decode the token to check for expiry and calculate time left
          const decoded = jwt.decode(token) as { exp: number };
      
          if (!decoded || !decoded.exp) {
            return next(new ErrorResponse('Invalid token or missing expiration', 500));
          }
      
          const expiryTimestamp = decoded.exp * 1000; // Convert from seconds to milliseconds
          const minutesLeft = Math.ceil((expiryTimestamp - Date.now()) / (60 * 1000));

    // const setupLink = `${process.env.FRONTEND_URL}/setup-password/${normalizedEmail}`;
      // Prepare data for the email template
      const emailData = {
        name: firstName ,
        activationCode,
        setupLink,
        expiresAt: `in ${minutesLeft} minute${minutesLeft !== 1 ? 's' : ''}`,
          companyName: company?.branding?.displayName || company?.name,
          logoUrl: company?.branding?.logoUrl ,
          primaryColor: company?.branding?.primaryColor || "#0621b6b0",
      };

      // Send email using an EJS template for consistent formatting
      const emailSent = await sendEmail(
        normalizedEmail,
        'Account Setup Invitation',
        'account-setup.ejs', // You need to create this EJS template in your email templates folder
        emailData
      );

      // await User.findByIdAndUpdate(userId, { sendInvite: false });
      // if (!emailSent) {
      //   await User.findByIdAndUpdate(
      //            newUser._id,
      //           { sendInvite: true },
      //           { new: true } 
      //         );
      //   // return next(new ErrorResponse('Failed to send account setup email', 500));
      // }

      await logAudit({
      userId,
      action: 'INVITE_USER', 
      status: 'SUCCESS',
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });


    res.status(201).json({
      success: true,
      message: `${role} invited successfully`,
      data: {
        user: newUser
      },
    });

});


export const bulkImportUsers = asyncHandler(async (
  req: TypedRequest,
  res: TypedResponse<BulkImportResponse>,
  next: NextFunction
) => {
  const company = req.company
  const companyId = company?._id as Types.ObjectId;
  const userId = req.user?._id;
  let users: ParsedUser[] = [];

  if (req.file) {
    users = parseExcelUsers(req.file.buffer);
  } else if (Array.isArray(req.body)) {
    users = req.body;
  } else {
    return next(new ErrorResponse('Invalid input. Expecting an array or an Excel file.', 400));
  }

  const created: string[] = [];
  const updated: string[] = [];

  for (const user of users) {
    const existing = await User.findOne({ email: user.email }) as IUser;

    if (existing) {
      existing.firstName = user.firstName;
      existing.middleName = user.middleName;
      existing.lastName = user.lastName;
      existing.role = user.role;
      existing.department = user.department;
      existing.company = companyId;
      await existing.save();
      updated.push(user.email);
    } else {
      const newUser = new User({
        ...user,
        company: companyId,
        isActive: true,
      });

      await newUser.save();

      const { activationCode, token } = accessToken(newUser);
      const setupLink = createActivationLink(token);

      const decoded = jwt.decode(token) as { exp: number };
      if (!decoded?.exp) {
        return next(new ErrorResponse('Invalid token or missing expiration', 500));
      }

      const expiryTimestamp = decoded.exp * 1000;
      const minutesLeft = Math.ceil((expiryTimestamp - Date.now()) / (60 * 1000));

      const emailData = {
        name: user.firstName,
        activationCode,
        setupLink,
        expiresAt: `in ${minutesLeft} minute${minutesLeft !== 1 ? 's' : ''}`,
        companyName: company?.branding?.displayName || company?.name,
        logoUrl: company?.branding?.logoUrl,
        primaryColor: company?.branding?.primaryColor || "#0621b6b0",
      };

      const emailSent = await sendEmail(
        user.email,
        'Account Setup Invitation',
        'account-setup.ejs',
        emailData
      );

      // if (!emailSent) {
      //    await User.findByIdAndUpdate(
      //           userId,
      //           { sendInvite: true },
      //           { new: true } 
      //         );
      // }

      created.push(user.email);
    }
  }

  await logAudit({
    userId: req.user?.id,
    action: 'BULK_IMPORT',
    status: 'SUCCESS',
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });

  res.status(200).json({
    success: true,
    message: 'Users processed successfully.',
    data: {
      created,
      updated,
    },
  });
});

export const setupPassword = asyncHandler(
  async (req: TypedRequest<{},SetupPasswordQuery, SetupPasswordDTO>, res: TypedResponse<AuthData>, next: NextFunction) => {

    const { email, newPassword, passwordConfig, temporaryPassword }: SetPasswordDto = req.body;

    // Extract token from query params (this is how you get it from the URL)
    
    const activationToken = req.query.token;
    if (!activationToken) {
      return next(new ErrorResponse('Token is required', 400));
    }

    // Validate password based on frontend config
    if (!validatePassword(newPassword, passwordConfig)) {
      return next(new ErrorResponse('Password does not meet security policy', 400));
    }

    // Decode the token and extract user information
    let decodedToken: { user: IUser; activationCode: string; exp: number };

    try {
      decodedToken = jwt.verify(activationToken, process.env.ACCESS_TOKEN as Secret) as { user: IUser; activationCode: string; exp: number };
    } catch (error) {
      return next(new ErrorResponse('Invalid or expired token', 400));
    }

    const decodedUser = decodedToken.user;  // User info comes from the decoded token

    // Fetch the user from the database to ensure it's a Mongoose document
    const user = await User.findOne({ email: decodedUser.email });

    if (!user) {
      return next(new ErrorResponse('User not found', 404));
    }

    // Ensure companyId is set correctly from the user document
    const companyId = user.company.toString();  // Company ID extracted from user document
    if (!companyId) {
      return next(new ErrorResponse('Company ID is required', 400));
    }

    // Verify that the user belongs to the same company
    if (user.company.toString() !== companyId) {
      return next(new ErrorResponse('User does not belong to this company', 403));
    }

    // Check if the temporary password matches the one sent to the user's email
    if (decodedToken.activationCode !== temporaryPassword) {
      return next(new ErrorResponse('Invalid temporary password', 400));
    }

    // Update the password and set user to active after validation
    user.password = newPassword;
    user.isActive = true;  // Activate the user once password is set

    // Save the updated user object
    await user.save();

    // Log the action with user-specific companyId and password setup details
    await logAudit({
      userId: user._id,  // Using user._id as userId
      action: 'SETUP_PASSWORD',
      status: 'SUCCESS',
      ip: req.ip,
      userAgent: req.get('user-agent'),
      companyId,  // Log the company ID associated with the user
    });

    // Send response indicating success
    res.status(200).json({
      success: true,
      message: 'Password set successfully. You can now log in.',
    });
  }
);



export const refreshAccessToken = async (
  req: TypedRequest,
  res: TypedResponse<AuthData>,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return next(new ErrorResponse("No refresh token provided", 401));
    }

    const refreshToken = authHeader.split(" ")[1];
    
    // Check if token is blacklisted
    if (await isTokenBlacklisted(refreshToken)) {
      return next(new ErrorResponse("Refresh token has been revoked", 401));
    }

    // Verify the refresh token
    const decoded = jwt.verify(
      refreshToken,
      process.env.REFRESH_TOKEN as string
    ) as JwtPayload as { id: string; exp: number };

    const user = await User.findById(decoded.id) as IUser;
    if (!user) {
      return next(new ErrorResponse("User not found", 404));
    }

    // Optional: Revoke current refresh token in Redis here if desired
    // await blacklistToken(refreshToken); 

    // Log audit
    await logAudit({
      userId: user.id.toString(),
      action: "REFRESH_ACCESS_TOKEN",
      status: "SUCCESS",
      ip: req.ip,
      userAgent: req.get("user-agent"),
    });

    // Generate and send new tokens
    await sendToken(user, 200, res, next);

  } catch (error) {
    return next(new ErrorResponse("Invalid or expired refresh token", 401));
  }
};



export const logout = asyncHandler(
  async (req: TypedRequest, res: TypedResponse<AuthData>, next: NextFunction) => {
    let token: string | null = null;

    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      token = authHeader.split(" ")[1];
    }

    // 🔁 Fallback to cookie if no Authorization header
    if (!token && req.cookies?.access_token) {
      token = req.cookies.access_token;
    }

    if (!token) {
      return next(new ErrorResponse("No token provided", 401));
    }

    const decodedToken = jwt.decode(token) as { id: string; exp: number } | null;

    if (!decodedToken || !decodedToken.exp) {
      return next(new ErrorResponse("Invalid token", 401));
    }

    const ttl = Math.floor(decodedToken.exp - Date.now() / 1000);
    if (ttl > 0) {
      await redisClient.setex(`bl:${token}`, ttl, "revoked");
    }

    await redisClient.del(`session:${decodedToken.id}`);

    await logAudit({
      userId: decodedToken.id,
      action: "LOGOUT",
      status: "SUCCESS",
      ip: req.ip,
      userAgent: req.get("user-agent"),
    });

    // 🧹 Clear cookies
    res.clearCookie("access_token");
    res.clearCookie("refresh_token");

    return res.status(200).json({
      success: true,
      message: "Logged out successfully",
      data: {
        token: null,
        refreshToken: null,
      },
    });
  }
);

