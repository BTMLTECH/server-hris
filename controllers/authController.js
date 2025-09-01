"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logout = exports.getNextStaffId = exports.refreshAccessToken = exports.setupPassword = exports.bulkImportUsers = exports.inviteUser = exports.sendActivationPasswordLink = exports.requestPassword = exports.resend2FACode = exports.verify2FA = exports.registerAdmin = exports.accessToken = exports.createActivationToken = exports.login = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const user_model_1 = __importDefault(require("../models/user.model"));
const ErrorResponse_1 = __importDefault(require("../utils/ErrorResponse"));
const logAudit_1 = require("../utils/logAudit");
const passwordValidator_1 = require("../utils/passwordValidator");
const redisClient_1 = require("../utils/redisClient");
const excelParser_1 = require("../utils/excelParser");
const emailUtil_1 = require("../utils/emailUtil");
const Company_1 = __importDefault(require("../models/Company"));
const generateToken_1 = require("../utils/generateToken");
const auth_middleware_1 = require("../middleware/auth.middleware");
const asyncHandler_1 = require("../middleware/asyncHandler");
const payrollCalculator_1 = require("../utils/payrollCalculator");
const PayrollNew_1 = __importDefault(require("../models/PayrollNew"));
const OnboardingRequirement_1 = require("../models/OnboardingRequirement");
const sendNotification_1 = require("../utils/sendNotification");
const userHelpers_1 = require("../utils/userHelpers");
// export const login = asyncHandler(async (req: TypedRequest<{}, {}, LoginDTO>, res: TypedResponse<AuthData>, next: NextFunction) => {
//     const { email, password } = req.body; 
//     const user = await User.findOne({ email }).select('+password').populate('company') as unknown as IUser & { company: ICompany };
//     if (!user || !user.isActive) {
//         return next(new ErrorResponse('Invalid credentials or inactive user', 401));
//     }
//     if (user.lockUntil && user.lockUntil > new Date()) {
//         return next(new ErrorResponse('Account locked. Try again later.', 403));
//     }
//     const isMatch = await user.comparePassword(password);
//     if (!isMatch) {
//         user.failedLoginAttempts++;
//         if (user.failedLoginAttempts >= 5) {
//             user.lockUntil = new Date(Date.now() + 30 * 60 * 1000);
//         }
//         await user.save();
//         return next(new ErrorResponse('Invalid credentials', 401));
//     }
//     user.failedLoginAttempts = 0;
//     user.lockUntil = undefined;
//     // Generate the token and activation code
//     const { token, activationCode } = createActivationToken(user); 
//     // Decode the token and extract the user information
//     const decoded = jwt.decode(token) as { user: { _id: string }; exp: number };
//     if (!decoded || !decoded.user || !decoded.user._id || !decoded.exp) {
//         return next(new ErrorResponse('Invalid token or missing expiration', 500));
//     }
//     const expiryTimestamp = decoded.exp * 1000; // Convert from seconds to milliseconds
//     const minutesLeft = Math.ceil((expiryTimestamp - Date.now()) / (60 * 1000));
//     const company = req.company;
//     const emailData = {
//         name: user.firstName,
//         code: activationCode,
//         expiresAt: `in ${minutesLeft} minute${minutesLeft !== 1 ? 's' : ''}`,
//         companyName: user.company?.branding?.displayName || user.company?.name,
//         logoUrl: user.company?.branding?.logoUrl,
//         primaryColor: user.company?.branding?.primaryColor || "#0621b6b0",
//     };
//     await redisClient.set(`2fa:${user.email}`, JSON.stringify({ code: activationCode, token }), 'EX', 1800);
//     const emailSent = await sendEmail(
//         user.email,
//         'Your 2FA Code',
//         '2fa-code.ejs', // Ensure this template exists in the correct folder
//         emailData
//     );
//     if (!emailSent) {
//         return next(new ErrorResponse('Failed to send 2FA email', 500));
//     }
//     // Log the audit with the decoded user ID
//     await logAudit({
//         userId: decoded.user._id, // Use decoded.user._id to access the user ID
//         action: 'LOGIN',
//         status: 'SUCCESS',
//         ip: req.ip,
//         userAgent: req.get('user-agent'),
//     });
//         res.status(200).json({
//         success: true,
//         message: '2FA code sent to your email',
//         data:{
//           token
//         }
//     });
// });
exports.login = (0, asyncHandler_1.asyncHandler)(async (req, res, next) => {
    const { email, password } = req.body;
    const user = await user_model_1.default.findOne({ email }).select('+password').populate('company');
    if (!user || !user.isActive) {
        return next(new ErrorResponse_1.default('Invalid credentials or inactive user', 401));
    }
    if (user.lockUntil && user.lockUntil > new Date()) {
        return next(new ErrorResponse_1.default('Account locked. Try again later.', 403));
    }
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
        user.failedLoginAttempts++;
        if (user.failedLoginAttempts >= 5) {
            user.lockUntil = new Date(Date.now() + 30 * 60 * 1000); // 30 mins lock
        }
        await user.save();
        return next(new ErrorResponse_1.default('Invalid credentials', 401));
    }
    user.failedLoginAttempts = 0;
    user.lockUntil = undefined;
    const { token, activationCode } = (0, exports.createActivationToken)(user);
    const decoded = jsonwebtoken_1.default.decode(token);
    if (!decoded || !decoded.user || !decoded.user._id || !decoded.exp) {
        return next(new ErrorResponse_1.default('Invalid token or missing expiration', 500));
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
    // ✅ Save 2FA token in Redis for both real and test accounts
    await redisClient_1.redisClient.set(`2fa:${user.email}`, JSON.stringify({ code: activationCode, token }), 'EX', 1800);
    const emailSent = await (0, emailUtil_1.sendEmail)(user.email, 'Your 2FA Code', '2fa-code.ejs', emailData);
    if (!emailSent) {
        return next(new ErrorResponse_1.default('Failed to send 2FA email', 500));
    }
    await (0, logAudit_1.logAudit)({
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
            token
        }
    });
});
const createActivationToken = (user) => {
    // const activationCode = Math.floor(1000 + Math.random() * 900000).toString();
    const activationCode = (0, passwordValidator_1.generateRandomPassword)(6);
    const token = jsonwebtoken_1.default.sign({
        user,
        activationCode,
    }, process.env.JWT_SECRET, { expiresIn: "30m" });
    return { activationCode, token };
};
exports.createActivationToken = createActivationToken;
const accessToken = (user) => {
    const activationCode = (0, passwordValidator_1.generateRandomPassword)(6);
    const token = jsonwebtoken_1.default.sign({
        user,
        activationCode,
    }, process.env.ACCESS_TOKEN, { expiresIn: "30m" });
    return { activationCode, token };
};
exports.accessToken = accessToken;
exports.registerAdmin = (0, asyncHandler_1.asyncHandler)(async (req, res, next) => {
    const { firstName, lastName, middleName, email, password, role, passwordConfig, } = req.body;
    // Basic field check
    if (!email || !password || !firstName || !lastName || !role) {
        return next(new ErrorResponse_1.default('Missing required fields', 400));
    }
    // Normalize email
    const normalizedEmail = email.trim().toLowerCase();
    // Check for existing user
    const existing = await user_model_1.default.findOne({ email: normalizedEmail });
    if (existing)
        return next(new ErrorResponse_1.default('User already exists', 400));
    // Validate password
    const policy = passwordConfig || {
        minLength: 8,
        requireUppercase: true,
        requireNumber: true,
        requireSpecialChar: true,
    };
    if (!(0, passwordValidator_1.validatePassword)(password, policy)) {
        return next(new ErrorResponse_1.default('Password does not meet security policy', 400));
    }
    // Create user
    const newUser = await user_model_1.default.create({
        firstName,
        lastName,
        middleName,
        email: normalizedEmail,
        password,
        role,
        isActive: true,
    });
    await (0, logAudit_1.logAudit)({
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
exports.verify2FA = (0, asyncHandler_1.asyncHandler)(async (req, res, next) => {
    const { email, code } = req.body;
    const user = await user_model_1.default.findOne({ email });
    if (!user)
        return next(new ErrorResponse_1.default('Invalid user', 400));
    const stored = await redisClient_1.redisClient.get(`2fa:${email}`);
    if (!stored)
        return next(new ErrorResponse_1.default('2FA code expired or not found', 400));
    let parsed;
    try {
        parsed = JSON.parse(stored);
    }
    catch {
        return next(new ErrorResponse_1.default('Stored 2FA data is malformed', 500));
    }
    if (parsed.code !== code) {
        return next(new ErrorResponse_1.default('Invalid 2FA code', 400));
    }
    // Verify JWT expiration
    try {
        jsonwebtoken_1.default.verify(parsed.token, process.env.JWT_SECRET);
    }
    catch (err) {
        return next(new ErrorResponse_1.default('2FA token has expired or is invalid', 401));
    }
    await redisClient_1.redisClient.del(`2fa:${email}`);
    await (0, logAudit_1.logAudit)({
        userId: user._id,
        action: 'VERIFY_2FA',
        status: 'SUCCESS',
        ip: req.ip,
        userAgent: req.get('user-agent'),
    });
    (0, generateToken_1.sendToken)(user, 200, res, next);
});
// export const verify2FA = asyncHandler(async (
//   req: TypedRequest<{} , {},  Verify2FADTO>,
//   res: TypedResponse<AuthData>,
//   next: NextFunction
// ) => {
//   const { email, code } = req.body;
//   const user = await User.findOne({ email });
//   if (!user) return next(new ErrorResponse('Invalid user', 400));
//   const stored = await redisClient.get(`2fa:${email}`);
//   if (!stored) return next(new ErrorResponse('2FA code expired or not found', 400));
//   let parsed: { code: string; token: string };
//   try {
//     parsed = JSON.parse(stored);
//     } catch {
//     return next(new ErrorResponse('Stored 2FA data is malformed', 500));
//   }
//   if (parsed.code !== code) {
//     return next(new ErrorResponse('Invalid 2FA code', 400));
//   }
//   // Verify JWT expiration
//   try {
//     jwt.verify(parsed.token, process.env.JWT_SECRET as Secret);
//   } catch (err) {
//     return next(new ErrorResponse('2FA token has expired or is invalid', 401));
//   }
//   // Clean up
//   await redisClient.del(`2fa:${email}`);
//   // Audit log
//   await logAudit({
//     userId: user?._id,
//     action: 'VERIFY_2FA',
//     status: 'SUCCESS',
//     ip: req.ip,
//     userAgent: req.get('user-agent'),
//   });
//   sendToken(user, 200, res, next)
// });
// controllers/authController.ts
exports.resend2FACode = (0, asyncHandler_1.asyncHandler)(async (req, res, next) => {
    const { email } = req.body;
    const user = await user_model_1.default.findOne({ email }).populate('company');
    ;
    if (!user || !user.isActive) {
        return next(new ErrorResponse_1.default('Invalid or inactive user', 400));
    }
    const { token, activationCode } = (0, exports.createActivationToken)(user);
    const decoded = jsonwebtoken_1.default.decode(token);
    if (!decoded?.user?._id || !decoded.exp) {
        return next(new ErrorResponse_1.default('Token decoding failed', 500));
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
    await redisClient_1.redisClient.set(`2fa:${user.email}`, JSON.stringify({ code: activationCode, token }), 'EX', 1800);
    const emailSent = await (0, emailUtil_1.sendEmail)(user.email, 'Your 2FA Code (Resent)', '2fa-code.ejs', emailData);
    if (!emailSent) {
        return next(new ErrorResponse_1.default('Failed to send 2FA email', 500));
    }
    await (0, logAudit_1.logAudit)({
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
exports.requestPassword = (0, asyncHandler_1.asyncHandler)(async (req, res, next) => {
    const { email } = req.body;
    if (!email) {
        return next(new ErrorResponse_1.default("Email is required", 400));
    }
    const user = await user_model_1.default.findOne({ email });
    if (!user) {
        return next(new ErrorResponse_1.default("No user found with that email", 404));
    }
    // Add the email to the resetRequests array if it's not already there
    if (!user.resetRequested) {
        user.resetRequested = true;
        user.resetRequestedAt = new Date();
        user.isActive = false;
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
        await (0, logAudit_1.logAudit)({
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
    }
    catch (error) {
        return next(new ErrorResponse_1.default("Error processing password reset request", 500));
    }
});
exports.sendActivationPasswordLink = (0, asyncHandler_1.asyncHandler)(async (req, res, next) => {
    const { email } = req.body;
    if (!email) {
        return next(new ErrorResponse_1.default("Email is required to resend activation link", 400));
    }
    // Find user
    const user = await user_model_1.default.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
        return next(new ErrorResponse_1.default("User not found", 404));
    }
    // 🔑 Generate token + activation code
    const { activationCode, token } = (0, exports.accessToken)(user);
    const decoded = jsonwebtoken_1.default.decode(token);
    if (!decoded?.exp) {
        return next(new ErrorResponse_1.default("Invalid token or missing expiration", 500));
    }
    const expiryTimestamp = decoded.exp * 1000;
    const minutesLeft = Math.ceil((expiryTimestamp - Date.now()) / (60 * 1000));
    const company = req.company;
    // 📩 Use sendNotification instead of sendEmail
    const emailSent = await (0, sendNotification_1.sendNotification)({
        user,
        type: "INVITE",
        title: "Account Setup Invitation",
        message: `Welcome ${user.firstName}, please activate your account.`,
        emailSubject: "Account Setup Invitation",
        emailTemplate: "account-setup.ejs", // use your consistent template
        emailData: {
            name: user.firstName,
            activationCode,
            setupLink: (0, passwordValidator_1.createActivationLink)(token),
            expiresAt: `in ${minutesLeft} minute${minutesLeft !== 1 ? "s" : ""}`,
            companyName: company?.branding?.displayName || company?.name,
            logoUrl: company?.branding?.logoUrl,
            primaryColor: company?.branding?.primaryColor || "#0621b6b0",
        },
    });
    // ✅ Activate only if email sent
    if (emailSent) {
        await user_model_1.default.findByIdAndUpdate(user._id, { isActive: true });
    }
    else {
        return next(new ErrorResponse_1.default("Failed to resend activation email", 500));
    }
    // 📝 Audit Log
    await (0, logAudit_1.logAudit)({
        userId: user._id,
        action: "RESEND_ACTIVATION_LINK",
        status: "SUCCESS",
        ip: req.ip,
        userAgent: req.get("user-agent"),
    });
    res.status(200).json({
        success: true,
        message: "New activation email has been sent.",
    });
});
exports.inviteUser = (0, asyncHandler_1.asyncHandler)(async (req, res, next) => {
    const company = req.company;
    const companyId = company?._id;
    const userId = req.user?._id;
    // const tempBiometry = generateRandomPassword(8);
    const { staffId, title, firstName, lastName, middleName, gender, dateOfBirth, stateOfOrigin, address, city, mobile, email, department, position, officeBranch, employmentDate, accountInfo, role, nextOfKin, requirements, } = req.body;
    if (!userHelpers_1.VALID_DEPARTMENTS.includes(department)) {
        return next(new ErrorResponse_1.default(`Invalid department: ${department}`, 400));
    }
    // 🔒 Validation
    if (!staffId ||
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
        !nextOfKin?.relationship) {
        return next(new ErrorResponse_1.default("Missing required fields", 400));
    }
    const normalizedEmail = email.toLowerCase().trim();
    const existing = await user_model_1.default.findOne({ email: normalizedEmail });
    if (existing)
        return next(new ErrorResponse_1.default("User already exists", 400));
    // 👤 Create user
    const newUser = await user_model_1.default.create({
        staffId,
        title,
        gender,
        firstName,
        lastName,
        middleName,
        email: normalizedEmail,
        department,
        // biometryId: tempBiometry,
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
        status: "active",
    });
    const payrollResult = (0, payrollCalculator_1.calculatePayroll)({
        basicSalary: accountInfo.basicPay,
        totalAllowances: accountInfo.allowances,
    });
    await PayrollNew_1.default.create({
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
        status: 'pending'
    });
    let createdRequirements = [];
    if (requirements && requirements.length > 0) {
        for (const req of requirements) {
            // Map tasks safely
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
            // Create the requirement in DB
            const doc = await OnboardingRequirement_1.OnboardingRequirement.create({
                employee: newUser._id,
                department: req.department,
                tasks,
                createdAt: req.createdAt ? new Date(req.createdAt) : new Date(),
            });
            // Push to our DTO array
            createdRequirements.push({
                employee: doc.employee ? doc.employee.toString() : '',
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
    // 2️⃣ Prepare department -> task mapping
    const departmentTasks = {};
    for (const req of createdRequirements) {
        departmentTasks[req.department] = req.tasks.map((t) => t.name);
    }
    await Promise.all(Object.entries(departmentTasks).map(async ([dept, tasks]) => {
        // Decide which role to notify
        const roleToNotify = dept.toLowerCase() === "hr" ? "hr" : "teamlead";
        const leadUser = await user_model_1.default.findOne({
            department: dept,
            role: roleToNotify,
        });
        if (!leadUser)
            return;
        await (0, sendNotification_1.sendNotification)({
            user: leadUser,
            type: "INFO",
            title: `New Onboarding Tasks`,
            message: `A new staff (${firstName} ${lastName}) has the following ${dept} requirements: ${tasks.join(", ")}`,
            emailSubject: `Onboarding Tasks for ${dept}`,
            emailTemplate: "requirement-notification.ejs",
            emailData: {
                name: leadUser.firstName,
                staffName: `${firstName} ${lastName}`,
                department: dept,
                tasks,
                companyName: company?.branding?.displayName || company?.name,
                logoUrl: company?.branding?.logoUrl,
                primaryColor: company?.branding?.primaryColor || "#0621b6b0",
            },
        });
    }));
    // 📩 Send Activation Notification
    const { activationCode, token } = (0, exports.accessToken)(newUser);
    const setupLink = (0, passwordValidator_1.createActivationLink)(token);
    const decoded = jsonwebtoken_1.default.decode(token);
    if (!decoded || !decoded.exp) {
        return next(new ErrorResponse_1.default("Invalid token or missing expiration", 500));
    }
    const expiryTimestamp = decoded.exp * 1000;
    const minutesLeft = Math.ceil((expiryTimestamp - Date.now()) / (60 * 1000));
    const emailSent = await (0, sendNotification_1.sendNotification)({
        user: newUser,
        type: "INVITE",
        title: "Account Setup Invitation",
        message: `Welcome ${firstName}, please activate your account.`,
        emailSubject: "Account Setup Invitation",
        emailTemplate: "account-setup.ejs",
        emailData: {
            name: firstName,
            activationCode,
            setupLink,
            expiresAt: `in ${minutesLeft} minute${minutesLeft !== 1 ? "s" : ""}`,
            companyName: company?.branding?.displayName || company?.name,
            logoUrl: company?.branding?.logoUrl,
            primaryColor: company?.branding?.primaryColor || "#0621b6b0",
        },
    });
    if (emailSent) {
        await user_model_1.default.findByIdAndUpdate(newUser._id, { isActive: true });
    }
    // 📝 Audit Log
    await (0, logAudit_1.logAudit)({
        userId,
        action: "INVITE_USER",
        status: "SUCCESS",
        ip: req.ip,
        userAgent: req.get("user-agent"),
    });
    res.status(201).json({
        success: true,
        message: `${role} invited successfully`,
        data: { user: newUser },
    });
});
exports.bulkImportUsers = (0, asyncHandler_1.asyncHandler)(async (req, res, next) => {
    const company = req.company;
    const companyId = company?._id;
    const userId = req.user?._id;
    let users = [];
    // 📂 Parse input
    if (req.file) {
        users = (0, excelParser_1.parseExcelUsers)(req.file.buffer);
    }
    else if (Array.isArray(req.body)) {
        users = req.body;
    }
    else {
        return next(new ErrorResponse_1.default("Invalid input. Expecting an array or an Excel file.", 400));
    }
    const created = [];
    const updated = [];
    for (const user of users) {
        const { staffId, title, firstName, lastName, middleName, gender, dateOfBirth, stateOfOrigin, address, city, mobile, email, department, position, officeBranch, employmentDate, accountInfo, role, nextOfKin, requirements, } = user;
        // 🔒 Validation
        if (!userHelpers_1.VALID_DEPARTMENTS.includes(department)) {
            return next(new ErrorResponse_1.default(`Invalid department: ${department}`, 400));
        }
        if (!staffId ||
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
            !nextOfKin?.relationship) {
            return next(new ErrorResponse_1.default(`Missing required fields for user ${email}`, 400));
        }
        const normalizedEmail = email.toLowerCase().trim();
        const existing = await user_model_1.default.findOne({ email: normalizedEmail });
        if (existing) {
            return next(new ErrorResponse_1.default(`User already exists: ${normalizedEmail}`, 400));
        }
        // 👤 Create user
        // const tempBiometry = generateRandomPassword(8);
        const newUser = await user_model_1.default.create({
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
            accountInfo,
            nextOfKin,
            status: "active",
        });
        // 💰 Payroll
        const payrollResult = (0, payrollCalculator_1.calculatePayroll)({
            basicSalary: accountInfo.basicPay,
            totalAllowances: accountInfo.allowances,
        });
        await PayrollNew_1.default.create({
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
            status: "pending",
        });
        // 📋 Requirements
        let createdRequirements = [];
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
                const doc = await OnboardingRequirement_1.OnboardingRequirement.create({
                    employee: newUser._id,
                    department: req.department,
                    tasks,
                    createdAt: req.createdAt ? new Date(req.createdAt) : new Date(),
                });
                createdRequirements.push({
                    employee: doc.employee?.toString() || "",
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
        // 2️⃣ Notify relevant roles
        const departmentTasks = {};
        for (const req of createdRequirements) {
            departmentTasks[req.department] = req.tasks.map((t) => t.name);
        }
        await Promise.all(Object.entries(departmentTasks).map(async ([dept, tasks]) => {
            const roleToNotify = dept.toLowerCase() === "hr" ? "hr" : "teamlead";
            const leadUser = await user_model_1.default.findOne({
                department: dept,
                role: roleToNotify,
            });
            if (!leadUser)
                return;
            await (0, sendNotification_1.sendNotification)({
                user: leadUser,
                type: "INFO",
                title: `New Onboarding Tasks`,
                message: `A new staff (${firstName} ${lastName}) has the following ${dept} requirements: ${tasks.join(", ")}`,
                emailSubject: `Onboarding Tasks for ${dept}`,
                emailTemplate: "requirement-notification.ejs",
                emailData: {
                    name: leadUser.firstName,
                    staffName: `${firstName} ${lastName}`,
                    department: dept,
                    tasks,
                    companyName: company?.branding?.displayName || company?.name,
                    logoUrl: company?.branding?.logoUrl,
                    primaryColor: company?.branding?.primaryColor || "#0621b6b0",
                },
            });
        }));
        // 📩 Activation Notification
        const { activationCode, token } = (0, exports.accessToken)(newUser);
        const setupLink = (0, passwordValidator_1.createActivationLink)(token);
        const decoded = jsonwebtoken_1.default.decode(token);
        if (!decoded?.exp) {
            return next(new ErrorResponse_1.default("Invalid token or missing expiration", 500));
        }
        const expiryTimestamp = decoded.exp * 1000;
        const minutesLeft = Math.ceil((expiryTimestamp - Date.now()) / (60 * 1000));
        const emailSent = await (0, sendNotification_1.sendNotification)({
            user: newUser,
            type: "INVITE",
            title: "Account Setup Invitation",
            message: `Welcome ${firstName}, please activate your account.`,
            emailSubject: "Account Setup Invitation",
            emailTemplate: "account-setup.ejs",
            emailData: {
                name: firstName,
                activationCode,
                setupLink,
                expiresAt: `in ${minutesLeft} minute${minutesLeft !== 1 ? "s" : ""}`,
                companyName: company?.branding?.displayName || company?.name,
                logoUrl: company?.branding?.logoUrl,
                primaryColor: company?.branding?.primaryColor || "#0621b6b0",
            },
        });
        created.push(normalizedEmail);
        if (emailSent) {
            await user_model_1.default.findByIdAndUpdate(newUser._id, { isActive: true });
        }
    }
    // 📝 Audit Log
    await (0, logAudit_1.logAudit)({
        userId,
        action: "BULK_IMPORT",
        status: "SUCCESS",
        ip: req.ip,
        userAgent: req.get("user-agent"),
    });
    res.status(200).json({
        success: true,
        message: "Users imported successfully.",
        data: { created, updated },
    });
});
exports.setupPassword = (0, asyncHandler_1.asyncHandler)(async (req, res, next) => {
    const { newPassword, passwordConfig, temporaryPassword, token } = req.body;
    if (!token) {
        return next(new ErrorResponse_1.default('Token is required', 400));
    }
    // Validate password based on frontend config
    if (!(0, passwordValidator_1.validatePassword)(newPassword, passwordConfig)) {
        return next(new ErrorResponse_1.default('Password does not meet security policy', 400));
    }
    // Decode the token and extract user information
    let decodedToken;
    try {
        decodedToken = jsonwebtoken_1.default.verify(token, process.env.ACCESS_TOKEN);
    }
    catch (error) {
        return next(new ErrorResponse_1.default('Invalid or expired token', 400));
    }
    const decodedUser = decodedToken.user; // User info comes from the decoded token
    // Fetch the user from the database to ensure it's a Mongoose document
    const user = await user_model_1.default.findOne({ email: decodedUser.email });
    if (!user) {
        return next(new ErrorResponse_1.default('User not found', 404));
    }
    // Ensure companyId is set correctly from the user document
    const companyId = user.company.toString(); // Company ID extracted from user document
    if (!companyId) {
        return next(new ErrorResponse_1.default('Company ID is required', 400));
    }
    // Verify that the user belongs to the same company
    if (user.company.toString() !== companyId) {
        return next(new ErrorResponse_1.default('User does not belong to this company', 403));
    }
    // Check if the temporary password matches the one sent to the user's email
    if (decodedToken.activationCode !== temporaryPassword) {
        return next(new ErrorResponse_1.default('Invalid temporary password', 400));
    }
    user.password = newPassword;
    user.isActive = true;
    // Save the updated user object
    await user.save();
    // Log the action with user-specific companyId and password setup details
    await (0, logAudit_1.logAudit)({
        userId: user._id, // Using user._id as userId
        action: 'SETUP_PASSWORD',
        status: 'SUCCESS',
        ip: req.ip,
        userAgent: req.get('user-agent'),
        companyId, // Log the company ID associated with the user
    });
    // Send response indicating success
    res.status(200).json({
        success: true,
        message: 'Password set successfully. You can now log in.',
    });
});
const refreshAccessToken = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return next(new ErrorResponse_1.default("No refresh token provided", 401));
        }
        const refreshToken = authHeader.split(" ")[1];
        // Check if token is blacklisted
        if (await (0, auth_middleware_1.isTokenBlacklisted)(refreshToken)) {
            return next(new ErrorResponse_1.default("Refresh token has been revoked", 401));
        }
        // Verify the refresh token
        const decoded = jsonwebtoken_1.default.verify(refreshToken, process.env.REFRESH_TOKEN);
        const user = await user_model_1.default.findById(decoded.id);
        if (!user) {
            return next(new ErrorResponse_1.default("User not found", 404));
        }
        // Log audit
        await (0, logAudit_1.logAudit)({
            userId: user.id.toString(),
            action: "REFRESH_ACCESS_TOKEN",
            status: "SUCCESS",
            ip: req.ip,
            userAgent: req.get("user-agent"),
        });
        // Generate and send new tokens
        await (0, generateToken_1.sendToken)(user, 200, res, next);
    }
    catch (error) {
        return next(new ErrorResponse_1.default("Invalid or expired refresh token", 401));
    }
};
exports.refreshAccessToken = refreshAccessToken;
exports.getNextStaffId = (0, asyncHandler_1.asyncHandler)(async (req, res, next) => {
    try {
        const companyId = req.company?._id;
        if (!companyId) {
            return next(new ErrorResponse_1.default("Invalid company context", 400));
        }
        const lastStaff = await user_model_1.default.findOne({ company: companyId })
            .sort({ createdAt: -1 })
            .exec();
        let nextNumber = 1;
        if (lastStaff?.staffId) {
            const parts = lastStaff.staffId.split("-");
            const lastNumber = parseInt(parts[1], 10);
            if (!isNaN(lastNumber)) {
                nextNumber = lastNumber + 1;
            }
        }
        // Fetch company name from database
        const company = await Company_1.default.findById(companyId).exec();
        if (!company) {
            return next(new ErrorResponse_1.default("Company not found", 404));
        }
        const nextStaffId = `${company.name}-${nextNumber}`;
        res.status(200).json({
            success: true,
            data: nextStaffId,
        });
    }
    catch (err) {
        next(new ErrorResponse_1.default(err.message, 500));
    }
});
exports.logout = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    // 🧹 Clear cookies regardless of token
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
});
