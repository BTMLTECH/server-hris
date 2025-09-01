"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logAudit = void 0;
const AuditLog_1 = __importDefault(require("../models/AuditLog"));
const logAudit = async ({ userId, action, status, ip, userAgent, companyId, details }) => {
    try {
        await AuditLog_1.default.create({
            user: userId,
            action,
            status,
            ipAddress: ip,
            userAgent,
            companyId,
            details
        });
    }
    catch (err) {
    }
};
exports.logAudit = logAudit;
