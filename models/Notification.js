"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importStar(require("mongoose"));
const NotificationSchema = new mongoose_1.Schema({
    user: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['INFO', 'WARNING', 'ALERT', 'NEW_LEAVE_REQUEST', 'INVITE',
            'LEAVE_AWAITING_REVIEW', 'LEAVE_APPROVED', 'LEAVE_REJECTED',
            'LOAN_APPROVED', 'LOAN_AWAITING_REVIEW', 'NEW_LOAN_REQUEST',
            'LOAN_REJECTED', 'LOAN_REPAYMENT', 'NEW_HANDOVER',
            'NEW_APPRAISAL', 'PAYSLIP', 'NEW_PAYROLL', 'COOPERATIVE_REQUEST',
            'APPRAISAL_APPROVED', 'APPRAISAL_REJECTED'], default: 'INFO' },
    title: { type: String, required: true },
    message: { type: String, required: true },
    read: { type: Boolean, default: false },
    metadata: { type: mongoose_1.Schema.Types.Mixed },
    emailSubject: { type: String },
    emailTemplate: { type: String },
    emailData: { type: mongoose_1.Schema.Types.Mixed },
    createdAt: { type: Date, default: Date.now },
});
exports.default = mongoose_1.default.model('Notification', NotificationSchema);
