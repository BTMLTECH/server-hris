"use strict";
// utils/passwordValidator.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validatePassword = exports.createActivationLink = exports.accessToken = exports.createActivationToken = exports.generateRandomPassword = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const validatePassword = (password, config) => {
    // Set defaults if not provided
    const minLength = config.minLength || 8;
    const uppercaseRegex = config.requireUppercase ? /[A-Z]/ : null;
    const numberRegex = config.requireNumber ? /\d/ : null;
    const specialCharRegex = config.requireSpecialChar ? /[!@#$%^&*]/ : null;
    // Check for minimum length
    if (password.length < minLength) {
        return false; // Password is too short
    }
    // Check for uppercase letter if required
    if (uppercaseRegex && !uppercaseRegex.test(password)) {
        return false; // Password must contain at least one uppercase letter
    }
    // Check for number if required
    if (numberRegex && !numberRegex.test(password)) {
        return false; // Password must contain at least one number
    }
    // Check for special character if required
    if (specialCharRegex && !specialCharRegex.test(password)) {
        return false; // Password must contain at least one special character
    }
    return true;
};
exports.validatePassword = validatePassword;
const generateRandomPassword = (length) => {
    // const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    const chars = '0123456789';
    let password = '';
    for (let i = 0; i < length; i++) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
};
exports.generateRandomPassword = generateRandomPassword;
const createActivationLink = (token) => {
    return `http://staging-hris.btmlimited.net/set-password?token=${token}`;
};
exports.createActivationLink = createActivationLink;
const createActivationToken = (user) => {
    // const activationCode = Math.floor(1000 + Math.random() * 900000).toString();
    const activationCode = (0, exports.generateRandomPassword)(12);
    const token = jsonwebtoken_1.default.sign({
        user,
        activationCode,
    }, process.env.JWT_SECRET, { expiresIn: "30m" });
    return { activationCode, token };
};
exports.createActivationToken = createActivationToken;
// This is the existing accessToken function you have
const accessToken = (user) => {
    const activationCode = (0, exports.generateRandomPassword)(12);
    const token = jsonwebtoken_1.default.sign({
        user,
        activationCode,
    }, process.env.ACCESS_TOKEN, { expiresIn: "30m" });
    return { activationCode, token };
};
exports.accessToken = accessToken;
