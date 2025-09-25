import { NextFunction } from 'express';
import jwt, { JwtPayload, Secret } from 'jsonwebtoken';
import User, { IUser } from '../models/user.model';
import { TypedRequest } from '../types/typedRequest';
import { TypedResponse } from '../types/typedResponse';
import ErrorResponse from '../utils/ErrorResponse';
import { logAudit } from '../utils/logAudit';
import {
  createActivationLink,
  generateRandomPassword,
  validatePassword,
} from '../utils/passwordValidator';
import { redisClient } from '../utils/redisClient';
import {
  AdminUserData,
  AuthData,
  BulkImportResponse,
  IActivationCode,
  InviteUserDTO,
  LoginDTO,
  RegisterAdminDto,
  SetPasswordDto,
  SetupPasswordDTO,
  SetupPasswordQuery,
  Verify2FADTO,
} from '../types/auth';
import { parseExcelUsers, validateBankName } from '../utils/excelParser';
import { sendEmail } from '../utils/emailUtil';
import Company, { ICompany } from '../models/Company';
import { sendToken } from '../utils/generateToken';
import { isTokenBlacklisted } from '../middleware/auth.middleware';
import { asyncHandler } from '../middleware/asyncHandler';
import { VALID_DEPARTMENTS } from '../utils/userHelpers';
import { calculatePayroll } from '../utils/payrollCalculator';
import PayrollNew from '../models/PayrollNew';
import { OnboardingRequirement } from '../models/OnboardingRequirement';
import { sendNotification } from '../utils/sendNotification';
import LeaveBalance from '../models/LeaveBalance';
import { LeaveEntitlements } from '../models/LeaveRequest';
import { formatTimeLeft } from '../utils/formatTimeLeft';

export const login = asyncHandler(
  async (req: TypedRequest<{}, {}, LoginDTO>, res: TypedResponse<AuthData>, next: NextFunction) => {
    const { email, password } = req.body;

    const user = await User.findOne({ email })
      .select('+password')
      .populate<{ company: ICompany }>('company');

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

    const { token, activationCode } = createActivationToken(user);

    const decoded: any = jwt.decode(token);
    if (!decoded || !decoded.user || !decoded.user._id || !decoded.exp) {
      return next(new ErrorResponse('Invalid token or missing expiration', 500));
    }

    const expiryTimestamp = decoded.exp * 1000;
    const minutesLeft = Math.ceil((expiryTimestamp - Date.now()) / (60 * 1000));

    const emailData = {
      name: user.firstName,
      code: activationCode,
      expiresAt: `in ${minutesLeft} minute${minutesLeft !== 1 ? 's' : ''}`,
      companyName: user.company?.branding?.displayName || user.company?.name,
      logoUrl: user.company?.branding?.logoUrl,
      primaryColor: user.company?.branding?.primaryColor || '#0621b6b0',
    };

    // ✅ Save 2FA token in Redis for both real and test accounts
    await redisClient.set(
      `2fa:${user.email}`,
      JSON.stringify({ code: activationCode, token }),
      'EX',
      1800,
    );

    const emailSent = await sendEmail(user.email, 'Your 2FA Code', '2fa-code.ejs', emailData);

    if (!emailSent) {
      return next(new ErrorResponse('Failed to send 2FA email', 500));
    }

    await logAudit({
      userId: decoded.user._id,
      action: 'LOGIN',
      status: 'SUCCESS',
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.status(200).json({
      success: true,
      message: '2FA code sent to your email',
      data: {
        token,
      },
    });
  },
);

export const createActivationToken = (user: IUser): IActivationCode => {
  // const activationCode = Math.floor(1000 + Math.random() * 900000).toString();
  const activationCode = generateRandomPassword(6);

  const token = jwt.sign(
    {
      user,
      activationCode,
    },
    process.env.JWT_SECRET as Secret,
    { expiresIn: '7d' },
  );

  return { activationCode, token };
};

export const accessToken = (user: IUser): IActivationCode => {
  const activationCode = generateRandomPassword(6);

  const token = jwt.sign(
    {
      user,
      activationCode,
    },
    process.env.ACCESS_TOKEN as Secret,
    { expiresIn: '7d' },
  );

  return { activationCode, token };
};

export const registerAdmin = asyncHandler(
  async (
    req: TypedRequest<{}, {}, RegisterAdminDto>,
    res: TypedResponse<{}>,
    next: NextFunction,
  ) => {
    const { firstName, lastName, middleName, email, password, role, passwordConfig } = req.body;

    // Basic field check
    if (!email || !password || !firstName || !lastName || !role) {
      return next(new ErrorResponse('Missing required fields', 400));
    }

    // Normalize email
    const normalizedEmail = email.trim().toLowerCase();

    // Check for existing user
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      return next(new ErrorResponse('User already exists', 400));
    }

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
  },
);

export const verify2FA = asyncHandler(
  async (req: TypedRequest<{}, {}, Verify2FADTO>, res: TypedResponse<{}>, next: NextFunction) => {
    const { email, code } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return next(new ErrorResponse('Invalid user', 400));
    }

    const stored = await redisClient.get(`2fa:${email}`);
    if (!stored) {
      return next(new ErrorResponse('2FA code expired or not found', 400));
    }

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
      jwt.verify(parsed.token, process.env.JWT_SECRET as string);
    } catch (err) {
      return next(new ErrorResponse('2FA token has expired or is invalid', 401));
    }

    await redisClient.del(`2fa:${email}`);

    await logAudit({
      userId: user._id,
      action: 'VERIFY_2FA',
      status: 'SUCCESS',
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    sendToken(user, 200, res, next);
  },
);

export const resend2FACode = asyncHandler(
  async (
    req: TypedRequest<{}, {}, { email: string }>,
    res: TypedResponse<{}>,
    next: NextFunction,
  ) => {
    const { email } = req.body;

    const user = await User.findOne({ email }).populate<{ company: ICompany }>('company');
    if (!user || !user.isActive) {
      return next(new ErrorResponse('Invalid or inactive user', 400));
    }

    const { token, activationCode } = createActivationToken(user);
    const decoded = jwt.decode(token) as any;
    if (!decoded?.user?._id || !decoded.exp) {
      return next(new ErrorResponse('Token decoding failed', 500));
    }

    const expiryTimestamp = decoded.exp * 1000;
    const minutesLeft = Math.ceil((expiryTimestamp - Date.now()) / (60 * 1000));

    const emailData = {
      name: user.firstName,
      code: activationCode,
      expiresAt: `in ${minutesLeft} minute${minutesLeft !== 1 ? 's' : ''}`,
      companyName: user.company?.branding?.displayName || user.company?.name,
      logoUrl: user.company?.branding?.logoUrl,
      primaryColor: user.company?.branding?.primaryColor || '#0621b6b0',
    };

    await redisClient.set(
      `2fa:${user.email}`,
      JSON.stringify({ code: activationCode, token }),
      'EX',
      1800,
    );

    const emailSent = await sendEmail(
      user.email,
      'Your 2FA Code (Resent)',
      '2fa-code.ejs',
      emailData,
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
      success: true,
    });
  },
);

export const requestPassword = asyncHandler(
  async (
    req: TypedRequest<{}, {}, { email: string }>,
    res: TypedResponse<AuthData>,
    next: NextFunction,
  ) => {
    const { email } = req.body;

    if (!email) {
      return next(new ErrorResponse('Email is required', 400));
    }

    const user = await User.findOne({ email });
    if (!user) {
      return next(new ErrorResponse('No user found with that email', 404));
    }

    // Add the email to the resetRequests array if it's not already there
    if (!user.resetRequested) {
      user.resetRequested = true;
      user.resetRequestedAt = new Date(); // Optional
      await user.save();
    }
    // Send email to admin notifying them about the request
    try {
      // Log the reset request for audit
      await logAudit({
        userId: user._id,
        action: 'PASSWORD_RESET_REQUEST',
        status: 'PENDING',
        ip: req.ip,
        userAgent: req.get('user-agent'),
      });

      res.status(200).json({
        success: true,
        message:
          'Password reset request has been sent to the admin. You will be notified once processed.',
      });
    } catch (error) {
      return next(new ErrorResponse('Error processing password reset request', 500));
    }
  },
);

export const sendActivationPasswordLink = asyncHandler(
  async (
    req: TypedRequest<{}, {}, { email: string }>,
    res: TypedResponse<AdminUserData>,
    next: NextFunction,
  ) => {
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
      logoUrl: company?.branding?.logoUrl,
      primaryColor: company?.branding?.primaryColor || '#0621b6b0',
    };

    // Send the email
    const emailSent = await sendEmail(
      user.email,
      'Activate Your  Account',
      'loginAdmin-link.ejs',
      emailData,
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
  },
);

export const inviteUser = asyncHandler(
  async (
    req: TypedRequest<{}, {}, InviteUserDTO>,
    res: TypedResponse<{ user: IUser }>,
    next: NextFunction,
  ) => {
    const company = req.company;
    const companyId = company?._id;
    const userId = req.user?._id;

    const {
      staffId,
      title,
      firstName,
      lastName,
      middleName,
      gender,
      dateOfBirth,
      stateOfOrigin,
      address,
      city,
      mobile,
      email,
      department,
      position,
      officeBranch,
      employmentDate,
      accountInfo,
      role,
      nextOfKin,
      requirements,
    } = req.body;

    if (!VALID_DEPARTMENTS.includes(department)) {
      return next(new ErrorResponse(`Invalid department: ${department}`, 400));
    }

    // Required field validation
    if (
      !staffId ||
      !title ||
      !gender ||
      !email ||
      !role ||
      !firstName ||
      !lastName ||
      !department ||
      !employmentDate ||
      !mobile ||
      !dateOfBirth ||
      !stateOfOrigin ||
      !city ||
      !position ||
      !officeBranch ||
      !address ||
      !accountInfo?.classLevel ||
      !accountInfo?.basicPay ||
      !accountInfo?.allowances ||
      !accountInfo?.bankAccountNumber ||
      !accountInfo?.bankName ||
      !nextOfKin?.name ||
      !nextOfKin?.phone ||
      !nextOfKin?.relationship
    ) {
      return next(new ErrorResponse('Missing required fields', 400));
    }

    const normalizedEmail = email.toLowerCase().trim();
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) return next(new ErrorResponse('User already exists', 400));

    // 👤 Create user
    const newUser = await User.create({
      staffId,
      title,
      gender,
      firstName,
      lastName,
      middleName,
      email: normalizedEmail,
      department,
      role,
      isActive: false,
      company: companyId,
      employmentDate,
      mobile,
      dateOfBirth,
      position,
      address,
      city,
      stateOfOrigin,
      accountInfo,
      nextOfKin,
      status: 'active',
    });

    // Payroll creation
    const payrollResult = calculatePayroll({
      basicSalary: accountInfo.basicPay!,
      totalAllowances: accountInfo.allowances!,
    });

    await PayrollNew.create({
      user: newUser._id,
      classLevel: accountInfo.classLevel,
      basicSalary: accountInfo.basicPay,
      totalAllowances: payrollResult.totalAllowances,
      grossSalary: payrollResult.grossSalary,
      pension: payrollResult.pension,
      CRA: payrollResult.CRA,
      taxableIncome: payrollResult.taxableIncome,
      tax: payrollResult.tax,
      netSalary: payrollResult.netSalary,
      taxBands: payrollResult.taxBands,
      month: new Date().getMonth() + 1,
      year: new Date().getFullYear(),
      status: 'pending',
    });

    await LeaveBalance.create({
      user: newUser._id,
      company: companyId,
      balances: {
        annual: LeaveEntitlements.annual,
        compassionate: LeaveEntitlements.compassionate,
        maternity: LeaveEntitlements.maternity,
      },
      year: new Date().getFullYear(),
    });

    let createdRequirements: any[] = [];
    if (requirements && requirements.length > 0) {
      for (const req of requirements) {
        const tasks = req.tasks.map((task) => ({
          name: task.name,
          category: task.category,
          completed: Boolean(task.completed),
          completedAt: task.completed
            ? task.completedAt
              ? new Date(task.completedAt)
              : new Date()
            : undefined,
        }));

        const doc = await OnboardingRequirement.create({
          employee: newUser._id,
          department: req.department,
          tasks,
          createdAt: req.createdAt ? new Date(req.createdAt) : new Date(),
        });

        createdRequirements.push({
          employee: doc.employee?.toString() || '',
          department: doc.department,
          tasks: doc.tasks.map((t) => ({
            name: t.name,
            category: t.category,
            completed: t.completed,
            completedAt: t.completedAt || undefined,
          })),
          createdAt: doc.createdAt,
        });
      }
    }

    const departmentTasks: Record<string, string[]> = {};
    for (const req of createdRequirements) {
      departmentTasks[req.department] = req.tasks.map((t: { name: any }) => t.name);
    }

    await Promise.all(
      Object.entries(departmentTasks).map(async ([dept, tasks]) => {
        const roleToNotify = dept.toLowerCase() === 'hr' ? 'hr' : 'teamlead';
        const leadUser = await User.findOne({
          department: dept,
          role: roleToNotify,
        });
        if (!leadUser) return;

        await sendNotification({
          user: leadUser,
          type: 'INFO',
          title: `New Onboarding Tasks`,
          message: `A new staff (${firstName} ${lastName}) has the following ${dept} requirements: ${tasks.join(', ')}`,
          emailSubject: `Onboarding Tasks for ${dept}`,
          emailTemplate: 'requirement-notification.ejs',
          emailData: {
            name: leadUser.firstName,
            staffName: `${firstName} ${lastName}`,
            department: dept,
            tasks,
            companyName: company?.branding?.displayName || company?.name,
            logoUrl: company?.branding?.logoUrl,
            primaryColor: company?.branding?.primaryColor || '#0621b6b0',
          },
        });
      }),
    );

    const { activationCode, token } = (exports as any).accessToken(newUser);
    const setupLink = createActivationLink(token);
    const decoded = jwt.decode(token) as { exp: number };

    if (!decoded || !decoded.exp) {
      return next(new ErrorResponse('Invalid token or missing expiration', 500));
    }

    const expiryTimestamp = decoded.exp * 1000;
    const minutesLeft = Math.ceil((expiryTimestamp - Date.now()) / (60 * 1000));

    const emailSent = await sendNotification({
      user: newUser,
      type: 'INVITE',
      title: 'Account Setup Invitation',
      message: `Welcome ${firstName}, please activate your account.`,
      emailSubject: 'Account Setup Invitation',
      emailTemplate: 'account-setup.ejs',
      emailData: {
        name: firstName,
        activationCode,
        setupLink,
        expiresAt: `in ${minutesLeft} minute${minutesLeft !== 1 ? 's' : ''}`,
        companyName: company?.branding?.displayName || company?.name,
        logoUrl: company?.branding?.logoUrl,
        primaryColor: company?.branding?.primaryColor || '#0621b6b0',
      },
    });

    if (emailSent) {
      await User.findByIdAndUpdate(newUser._id, { isActive: true });
    }

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
      data: { user: newUser },
    });
  },
);

export const bulkImportUsers = asyncHandler(
  async (
    req: TypedRequest<{}, InviteUserDTO[] | {}, {}>,
    res: TypedResponse<BulkImportResponse>,
    next: NextFunction,
  ) => {
    const company = req.company;
    const companyId = company?._id;
    const userId = req.user?._id;

    let users = [];

    if (req.file) {
      users = parseExcelUsers(req.file.buffer);
    } else if (Array.isArray(req.body)) {
      users = req.body;
    } else {
      return next(new ErrorResponse('Invalid input. Expecting an array or an Excel file.', 400));
    }

    const created: string[] = [];
    const updated: string[] = [];
    const skipped: string[] = [];

    for (const user of users) {
      const {
        staffId,
        title,
        firstName,
        lastName,
        middleName,
        gender,
        dateOfBirth,
        stateOfOrigin,
        address,
        city,
        mobile,
        email,
        department,
        position,
        officeBranch,
        employmentDate,
        accountInfo,
        role,
        nextOfKin,
        requirements,
      } = user;

      // 🔒 Validation
      if (!VALID_DEPARTMENTS.includes(department)) {
        return next(new ErrorResponse(`Invalid department: ${department}`, 400));
      }

      if (!validateBankName(accountInfo?.bankName)) {
        return next(
          new ErrorResponse(`Invalid bank name for user ${email}: ${accountInfo?.bankName}`, 400),
        );
      }

      if (nextOfKin && Object.values(nextOfKin).some((val) => val)) {
        if (!nextOfKin.name || !nextOfKin.phone || !nextOfKin.relationship) {
          return next(new ErrorResponse(`Incomplete Next of Kin details for user ${email}`, 400));
        }
      }

      const normalizedEmail = email.toLowerCase().trim();
      const existing = await User.findOne({ email: normalizedEmail });
      // if (existing) {
      //   return next(new ErrorResponse(`User already exists: ${normalizedEmail}`, 400));
      // }

      if (existing) {
        skipped.push(normalizedEmail);
        continue;
      }

      // 👤 Create user
      const newUser = await User.create({
        staffId,
        title,
        gender,
        firstName,
        lastName,
        middleName,
        email: normalizedEmail,
        department,
        role,
        isActive: true,
        company: companyId,
        employmentDate,
        mobile,
        dateOfBirth,
        position,
        address,
        city,
        stateOfOrigin,
        officeBranch,
        accountInfo,
        nextOfKin,
        status: 'active',
      });

      // 💰 Payroll
      const payrollResult = calculatePayroll({
        basicSalary: accountInfo.basicPay,
        totalAllowances: accountInfo.allowances,
      });

      await PayrollNew.create({
        user: newUser._id,
        classLevel: accountInfo.classLevel,
        basicSalary: accountInfo.basicPay,
        totalAllowances: payrollResult.totalAllowances,
        grossSalary: payrollResult.grossSalary,
        pension: payrollResult.pension,
        CRA: payrollResult.CRA,
        taxableIncome: payrollResult.taxableIncome,
        tax: payrollResult.tax,
        company: companyId,
        netSalary: payrollResult.netSalary,
        taxBands: payrollResult.taxBands,
        month: new Date().getMonth() + 1,
        year: new Date().getFullYear(),
        status: 'pending',
      });

      await LeaveBalance.create({
        user: newUser._id,
        company: companyId,
        balances: {
          annual: LeaveEntitlements.annual,
          compassionate: LeaveEntitlements.compassionate,
          maternity: LeaveEntitlements.maternity,
        },
        year: new Date().getFullYear(),
      });

      // 📋 Requirements
      let createdRequirements: any[] = [];
      if (requirements && requirements.length > 0) {
        for (const req of requirements) {
          const tasks = req.tasks.map((task: any) => ({
            name: task.name,
            category: task.category,
            completed: Boolean(task.completed),
            completedAt: task.completed
              ? task.completedAt
                ? new Date(task.completedAt)
                : new Date()
              : undefined,
          }));

          const doc = await OnboardingRequirement.create({
            employee: newUser._id,
            department: req.department,
            tasks,
            createdAt: req.createdAt ? new Date(req.createdAt) : new Date(),
          });

          createdRequirements.push({
            employee: doc.employee?.toString() || '',
            department: doc.department,
            tasks: doc.tasks.map((t: any) => ({
              name: t.name,
              category: t.category,
              completed: t.completed,
              completedAt: t.completedAt || undefined,
            })),
            createdAt: doc.createdAt,
          });
        }
      }

      // 2️⃣ Notify relevant roles
      const departmentTasks: Record<string, string[]> = {};
      for (const req of createdRequirements) {
        departmentTasks[req.department] = req.tasks.map((t: any) => t.name);
      }

      await Promise.all(
        Object.entries(departmentTasks).map(async ([dept, tasks]) => {
          const roleToNotify = dept.toLowerCase() === 'hr' ? 'hr' : 'teamlead';
          const leadUser = await User.findOne({
            department: dept,
            role: roleToNotify,
          });
          if (!leadUser) return;

          await sendNotification({
            user: leadUser,
            type: 'INFO',
            title: `New Onboarding Tasks`,
            message: `A new staff (${firstName} ${lastName}) has the following ${dept} requirements: ${tasks.join(
              ', ',
            )}`,
            emailSubject: `Onboarding Tasks for ${dept}`,
            emailTemplate: 'requirement-notification.ejs',
            emailData: {
              name: leadUser.firstName,
              staffName: `${firstName} ${lastName}`,
              department: dept,
              tasks,
              companyName: company?.branding?.displayName || company?.name,
              logoUrl: company?.branding?.logoUrl,
              primaryColor: company?.branding?.primaryColor || '#0621b6b0',
            },
          });
        }),
      );

      const { activationCode, token } = (exports as any).accessToken(newUser);
      const setupLink = createActivationLink(token);
      const decoded = jwt.decode(token) as { exp?: number } | null;

      if (!decoded?.exp) {
        return next(new ErrorResponse('Invalid token or missing expiration', 500));
      }

      const expiryTimestamp = decoded.exp * 1000;
      const minutesLeft = Math.ceil((expiryTimestamp - Date.now()) / (60 * 1000));
      const expiresAt = formatTimeLeft(minutesLeft);

      const emailSent = await sendNotification({
        user: newUser,
        type: 'INVITE',
        title: 'Account Setup Invitation',
        message: `Welcome ${firstName}, please activate your account.`,
        emailSubject: 'Account Setup Invitation',
        emailTemplate: 'account-setup.ejs',
        emailData: {
          name: firstName,
          activationCode,
          setupLink,
          expiresAt,
          companyName: company?.branding?.displayName || company?.name,
          logoUrl: company?.branding?.logoUrl,
          primaryColor: company?.branding?.primaryColor || '#0621b6b0',
        },
      });

      created.push(normalizedEmail);

      if (emailSent) {
        await User.findByIdAndUpdate(newUser._id, { isActive: true });
      }
    }

    // 📝 Audit Log
    await logAudit({
      userId,
      action: 'BULK_IMPORT',
      status: 'SUCCESS',
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.status(200).json({
      success: true,
      message: 'Users imported successfully.',
      data: { created, updated },
    });
  },
);

export const setupPassword = asyncHandler(
  async (
    req: TypedRequest<{}, SetupPasswordQuery, SetupPasswordDTO>,
    res: TypedResponse<AuthData>,
    next: NextFunction,
  ) => {
    const { newPassword, passwordConfig, temporaryPassword, token }: SetupPasswordDTO = req.body;
    if (!token) {
      return next(new ErrorResponse('Token is required', 400));
    }

    if (!validatePassword(newPassword, passwordConfig)) {
      return next(new ErrorResponse('Password does not meet security policy', 400));
    }

    let decodedToken: { user: IUser; activationCode: string; exp: number };

    try {
      decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN as Secret) as {
        user: IUser;
        activationCode: string;
        exp: number;
      };
    } catch (error) {
      return next(new ErrorResponse('Invalid or expired token', 400));
    }

    const decodedUser = decodedToken.user;

    const user = await User.findOne({ email: decodedUser.email });

    if (!user) {
      return next(new ErrorResponse('User not found', 404));
    }

    const companyId = user.company.toString();
    if (!companyId) {
      return next(new ErrorResponse('Company ID is required', 400));
    }

    if (user.company.toString() !== companyId) {
      return next(new ErrorResponse('User does not belong to this company', 403));
    }

    if (decodedToken.activationCode !== temporaryPassword) {
      return next(new ErrorResponse('Invalid temporary password', 400));
    }

    user.password = newPassword;
    user.isActive = true;

    await user.save();

    await logAudit({
      userId: user._id,
      action: 'SETUP_PASSWORD',
      status: 'SUCCESS',
      ip: req.ip,
      userAgent: req.get('user-agent'),
      companyId,
    });

    res.status(200).json({
      success: true,
      message: 'Password set successfully. You can now log in.',
    });
  },
);

export const refreshAccessToken = async (
  req: TypedRequest,
  res: TypedResponse<AuthData>,
  next: NextFunction,
) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(new ErrorResponse('No refresh token provided', 401));
    }

    const refreshToken = authHeader.split(' ')[1];

    // Check if token is blacklisted
    if (await isTokenBlacklisted(refreshToken)) {
      return next(new ErrorResponse('Refresh token has been revoked', 401));
    }

    // Verify the refresh token
    const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN as string) as JwtPayload as {
      id: string;
      exp: number;
    };

    const user = (await User.findById(decoded.id)) as IUser;
    if (!user) {
      return next(new ErrorResponse('User not found', 404));
    }

    // Optional: Revoke current refresh token in Redis here if desired
    // await blacklistToken(refreshToken);

    // Log audit
    await logAudit({
      userId: user.id.toString(),
      action: 'REFRESH_ACCESS_TOKEN',
      status: 'SUCCESS',
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    // Generate and send new tokens
    await sendToken(user, 200, res, next);
  } catch (error) {
    return next(new ErrorResponse('Invalid or expired refresh token', 401));
  }
};

interface NextStaffIdResponse {
  success: boolean;
  data: string;
}

export const getNextStaffId = asyncHandler(
  async (req: TypedRequest, res: any, next: NextFunction) => {
    try {
      const companyId = req.company?._id;
      if (!companyId) {
        return next(new ErrorResponse('Invalid company context', 400));
      }

      const lastStaff = await User.findOne({ company: companyId }).sort({ createdAt: -1 }).exec();

      let nextNumber = 1;
      if (lastStaff?.staffId) {
        const parts = lastStaff.staffId.split('-');
        const lastNumber = parseInt(parts[1], 10);
        if (!isNaN(lastNumber)) {
          nextNumber = lastNumber + 1;
        }
      }

      // Fetch company name from database
      const company = await Company.findById(companyId).exec();
      if (!company) {
        return next(new ErrorResponse('Company not found', 404));
      }

      const nextStaffId = `${company.name}-${nextNumber}`;

      res.status(200).json({
        success: true,
        data: nextStaffId,
      });
    } catch (err: any) {
      next(new ErrorResponse(err.message, 500));
    }
  },
);

export const logout = asyncHandler(
  async (req: TypedRequest, res: TypedResponse<AuthData>, next: NextFunction) => {
    let token: string | null = null;

    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }

    // 🔁 Fallback to cookie if no Authorization header
    if (!token && req.cookies?.access_token) {
      token = req.cookies.access_token;
    }

    if (!token) {
      return next(new ErrorResponse('No token provided', 401));
    }

    const decodedToken = jwt.decode(token) as { id: string; exp: number } | null;

    if (!decodedToken || !decodedToken.exp) {
      return next(new ErrorResponse('Invalid token', 401));
    }

    const ttl = Math.floor(decodedToken.exp - Date.now() / 1000);
    if (ttl > 0) {
      await redisClient.setex(`bl:${token}`, ttl, 'revoked');
    }

    await redisClient.del(`session:${decodedToken.id}`);

    await logAudit({
      userId: decodedToken.id,
      action: 'LOGOUT',
      status: 'SUCCESS',
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    // 🧹 Clear cookies
    res.clearCookie('access_token');
    res.clearCookie('refresh_token');

    return res.status(200).json({
      success: true,
      message: 'Logged out successfully',
      data: {
        token: null,
        refreshToken: null,
      },
    });
  },
);
