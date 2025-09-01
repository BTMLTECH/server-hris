"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resendActivationLink = exports.createCompanyWithAdmin = void 0;
const Company_1 = __importDefault(require("../models/Company"));
const user_model_1 = __importDefault(require("../models/user.model"));
const ErrorResponse_1 = __importDefault(require("../utils/ErrorResponse"));
const passwordValidator_1 = require("../utils/passwordValidator");
const authController_1 = require("./authController");
const emailUtil_1 = require("../utils/emailUtil");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const logAudit_1 = require("../utils/logAudit");
const asyncHandler_1 = require("../middleware/asyncHandler");
const sendNotification_1 = require("../utils/sendNotification");
exports.createCompanyWithAdmin = (0, asyncHandler_1.asyncHandler)(async (req, res, next) => {
    const { companyName, companyDescription, adminData } = req.body;
    if (!companyName || !adminData) {
        return next(new ErrorResponse_1.default('Company name and admin data are required', 400));
    }
    const existingCompany = await Company_1.default.findOne({ name: companyName });
    if (existingCompany) {
        return next(new ErrorResponse_1.default('Company already exists', 400));
    }
    const existingEmail = await user_model_1.default.findOne({ email: adminData.email.toLowerCase().trim() });
    if (existingEmail) {
        return next(new ErrorResponse_1.default('Email is already registered. Please use a different email address.', 400));
    }
    // Create the company
    const company = await Company_1.default.create({
        name: companyName,
        description: companyDescription || '',
        roles: 'admin',
        department: 'admin',
        status: 'active',
        branding: {
            displayName: companyName,
            logoUrl: '',
            primaryColor: '#030577ab',
        }
    });
    const adminUser = await user_model_1.default.create({
        firstName: adminData.firstName,
        lastName: adminData.lastName,
        middleName: adminData.middleName,
        email: adminData.email.toLowerCase().trim(),
        role: 'admin',
        department: "admin",
        company: company.id,
        status: 'active'
    });
    const { activationCode, token } = (0, authController_1.accessToken)(adminUser);
    const activationLink = (0, passwordValidator_1.createActivationLink)(token);
    const decoded = jsonwebtoken_1.default.decode(token);
    if (!decoded || !decoded.exp) {
        return next(new ErrorResponse_1.default('Invalid token or missing expiration', 500));
    }
    const expiryTimestamp = decoded.exp * 1000; // Convert from seconds to milliseconds
    const minutesLeft = Math.ceil((expiryTimestamp - Date.now()) / (60 * 1000));
    const currentYear = new Date().getFullYear();
    const emailData = {
        name: adminUser.firstName,
        activationLink,
        expiresAt: `in ${minutesLeft} minute${minutesLeft !== 1 ? 's' : ''}`,
        defaultPassword: activationCode,
        companyName: company?.branding?.displayName || company?.name,
        logoUrl: company?.branding?.logoUrl,
        primaryColor: company?.branding?.primaryColor || "#0621b6b0",
        currentYear
    };
    // Send the activation email
    const emailSent = await (0, emailUtil_1.sendEmail)(adminUser.email, 'Activate Your Account', 'loginAdmin-link.ejs', emailData);
    if (!emailSent) {
        return next(new ErrorResponse_1.default('Failed to send activation email', 500));
    }
    // Log the action
    await (0, logAudit_1.logAudit)({
        userId: adminUser.id,
        action: 'ROLE_CREATED',
        status: 'SUCCESS',
        ip: req.ip,
        userAgent: req.get('user-agent'),
    });
    const companyObj = {
        id: company.id.toString(),
        name: company.name,
        description: company.description || '',
        roles: "admin",
        status: "active",
        department: company.department,
    };
    const adminUserObj = {
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
});
exports.resendActivationLink = (0, asyncHandler_1.asyncHandler)(async (req, res, next) => {
    const { email } = req.body;
    const company = req.company;
    if (!email) {
        return next(new ErrorResponse_1.default("Email is required to resend activation link", 400));
    }
    if (!company?._id) {
        return next(new ErrorResponse_1.default("Company context is required", 400));
    }
    const user = (await user_model_1.default.findOne({
        email: email.toLowerCase().trim(),
        company: company._id,
    }).populate("company"));
    if (!user) {
        return next(new ErrorResponse_1.default("User not found in this company", 404));
    }
    const { activationCode, token } = (0, authController_1.accessToken)(user);
    const setupLink = (0, passwordValidator_1.createActivationLink)(token);
    const decoded = jsonwebtoken_1.default.decode(token);
    if (!decoded?.exp) {
        return next(new ErrorResponse_1.default("Invalid token or missing expiration", 500));
    }
    const expiryTimestamp = decoded.exp * 1000;
    const minutesLeft = Math.ceil((expiryTimestamp - Date.now()) / (60 * 1000));
    const emailSent = await (0, sendNotification_1.sendNotification)({
        user,
        type: "INVITE",
        title: "Activation Link Resent",
        message: `Hello ${user.firstName}, a new activation link has been sent to your email.`,
        emailSubject: "Your Account Activation Link",
        emailTemplate: "account-setup.ejs",
        emailData: {
            name: user.firstName,
            activationCode,
            setupLink,
            expiresAt: `in ${minutesLeft} minute${minutesLeft !== 1 ? "s" : ""}`,
            companyName: user.company?.branding?.displayName || user.company?.name,
            logoUrl: user.company?.branding?.logoUrl,
            primaryColor: user.company?.branding?.primaryColor || "#0621b6b0",
        },
    });
    if (!emailSent) {
        return next(new ErrorResponse_1.default("Failed to resend activation notification", 500));
    }
    const updatedUser = await user_model_1.default.findByIdAndUpdate(user._id, { sendInvite: true }, { new: true });
    if (!updatedUser) {
        return next(new ErrorResponse_1.default("Failed to retrieve updated user data", 500));
    }
    // 📝 Audit Log
    await (0, logAudit_1.logAudit)({
        userId: user.id,
        action: "RESEND_ACTIVATION_LINK",
        status: "SUCCESS",
        ip: req.ip,
        userAgent: req.get("user-agent"),
    });
    res.status(200).json({
        success: true,
        message: "New activation notification (email + in-app) has been sent.",
        data: { user: updatedUser },
    });
});
