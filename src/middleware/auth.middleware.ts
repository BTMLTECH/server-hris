"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.allowEveryone = exports.allowEmployeesOnly = exports.allowTeamLead = exports.allowTeamLeadHRManager = exports.allowAdminAndHR = exports.allowAdminOnly = exports.allowAllRoles = exports.authorizeRoles = exports.protect = exports.isTokenBlacklisted = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const ErrorResponse_1 = __importDefault(require("../utils/ErrorResponse"));
const user_model_1 = __importDefault(require("../models/user.model"));
const redisClient_1 = require("../utils/redisClient");
const isTokenBlacklisted = async (token) => {
    const blacklisted = await redisClient_1.redisClient.get(`bl:${token}`);
    return !!blacklisted;
};
exports.isTokenBlacklisted = isTokenBlacklisted;
const protect = async (req, res, next) => {
    let token;
    // ✅ First check the Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
    }
    // ✅ Then fallback to cookie if Authorization header is missing
    if (!token && req.cookies?.access_token) {
        token = req.cookies.access_token;
    }
    if (!token) {
        return next(new ErrorResponse_1.default('No token provided', 401));
    }
    // ✅ Optional: token blacklist check
    if (await (0, exports.isTokenBlacklisted)(token)) {
        return next(new ErrorResponse_1.default('Token has been revoked', 401));
    }
    try {
        const decoded = jsonwebtoken_1.default.verify(token, process.env.ACCESS_TOKEN);
        const user = await user_model_1.default.findById(decoded.id).populate('company');
        if (!user) {
            return next(new ErrorResponse_1.default('User not found', 404));
        }
        req.user = user;
        req.company = user.company;
        next();
    }
    catch (err) {
        return next(new ErrorResponse_1.default('Invalid token', 401));
    }
};
exports.protect = protect;
const authorizeRoles = (...roles) => (req, res, next) => {
    const user = req.user;
    if (!user) {
        return next(new ErrorResponse_1.default('Not authorized, no user attached', 401));
    }
    if (roles.length === 0 || roles.includes('all')) {
        return next(); // ✅ allow all authenticated users
    }
    if (!roles.includes(user.role)) {
        return next(new ErrorResponse_1.default(`User role '${user.role}' is not authorized to access this route`, 403));
    }
    next();
};
exports.authorizeRoles = authorizeRoles;
// 👥 Allows all core roles
exports.allowAllRoles = (0, exports.authorizeRoles)('admin', 'hr', 'md', 'teamlead', 'employee');
// 👤 Only admins
exports.allowAdminOnly = (0, exports.authorizeRoles)('admin');
// 👤 admins and hr
exports.allowAdminAndHR = (0, exports.authorizeRoles)('admin', 'hr');
// 👤 mds and adminMdAndAbove = authorizeRoles('admin', 'md');
exports.allowTeamLeadHRManager = (0, exports.authorizeRoles)('teamlead', 'hr', 'md');
exports.allowTeamLead = (0, exports.authorizeRoles)('teamlead');
// 👤 employees only
exports.allowEmployeesOnly = (0, exports.authorizeRoles)('employee');
// 👤 Anyone authenticated (same as ALL)
exports.allowEveryone = (0, exports.authorizeRoles)('all');
