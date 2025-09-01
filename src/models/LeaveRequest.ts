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
exports.LeaveEntitlements = void 0;
const mongoose_1 = __importStar(require("mongoose"));
// Default leave entitlements (can later be stored in a settings collection)
exports.LeaveEntitlements = {
    annual: 21,
    compassionate: 7,
    maternity: 90,
};
const LeaveRequestSchema = new mongoose_1.Schema({
    user: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true },
    teamlead: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true },
    relievers: [
        {
            user: { type: mongoose_1.default.Schema.Types.ObjectId, ref: "User", required: true },
            firstName: { type: String, required: true },
            lastName: { type: String, required: true },
            status: {
                type: String,
                enum: ['Pending', 'Approved', 'Rejected'],
                default: 'Pending',
            },
            note: { type: String },
            creactedAt: { type: Date },
        }
    ],
    type: {
        type: String,
        enum: ['compassionate', 'annual', 'maternity'],
        required: true,
    },
    typeIdentify: { type: String, enum: ['leave'], required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    days: { type: Number, required: false },
    reason: { type: String, required: true },
    status: {
        type: String,
        enum: ['Pending', 'Approved', 'Rejected', 'Expired'],
        default: 'Pending',
    },
    // ✅ TS-safe array enum definition
    reviewLevels: {
        type: [{ type: String, enum: ['reliever', 'teamlead', 'hr'] }],
        default: function () {
            // Dynamically set relievers (2–3) + teamlead + hr
            const relieverCount = Math.min(Math.max(this.relievers?.length || 2, 2), 3);
            return Array(relieverCount).fill('reliever').concat(['teamlead', 'hr']);
        },
        validate: {
            validator: function (v) {
                // At least 2 relievers, followed by teamlead + hr
                if (!Array.isArray(v))
                    return false;
                const relieversCount = v.filter(r => r === 'reliever').length;
                const endsCorrectly = v[v.length - 2] === 'teamlead' && v[v.length - 1] === 'hr';
                return (relieversCount === 2 || relieversCount === 3) && endsCorrectly;
            },
            message: 'Review flow must start with 2 or 3 relievers, then include teamlead → hr as final approvers',
        },
    },
    reviewTrail: [
        {
            reviewer: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' },
            role: String,
            action: { type: String, enum: ['Pending', 'Approved', 'Rejected', 'Expired'] },
            date: Date,
            note: String,
        },
    ],
    allowance: { type: Boolean, default: true },
    url: { type: String },
    createdAt: { type: Date, default: Date.now },
});
exports.default = mongoose_1.default.model('LeaveRequest', LeaveRequestSchema);
