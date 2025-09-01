"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.tenantAuth = void 0;
const ErrorResponse_1 = __importDefault(require("../utils/ErrorResponse"));
const Company_1 = __importDefault(require("../models/Company")); // <-- Make sure you import this
const tenantAuth = async (req, res, next) => {
    try {
        if (!req.user || !req.user.company) {
            return next(new ErrorResponse_1.default('No company context found or not authenticated', 404));
        }
        const company = await Company_1.default.findById(req.user.company);
        if (!company) {
            return next(new ErrorResponse_1.default('Company not found', 404));
        }
        req.company = company; // ✅ Now this matches ICompany type
        next();
    }
    catch (err) {
        next(new ErrorResponse_1.default(err.message || 'Server error', 500));
    }
};
exports.tenantAuth = tenantAuth;
