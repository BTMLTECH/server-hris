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
// Schemas for the nested interfaces
const SalaryByDeptSchema = new mongoose_1.Schema({
    department: { type: String, required: true },
    avgSalary: { type: Number, required: true },
    minSalary: { type: Number, required: true },
    maxSalary: { type: Number, required: true },
    employees: { type: Number, required: true },
});
const SalaryByRoleSchema = new mongoose_1.Schema({
    role: { type: String, required: true },
    avgSalary: { type: Number, required: true },
    count: { type: Number, required: true },
    fill: { type: String, required: true },
});
const LeaveAnalyticsSchema = new mongoose_1.Schema({
    type: { type: String, required: true },
    used: { type: Number, required: true },
    total: { type: Number, required: true },
    fill: { type: String, required: true },
});
const HiringTrendSchema = new mongoose_1.Schema({
    month: { type: String, required: true },
    hires: { type: Number, required: true },
    terminations: { type: Number, required: true },
});
const AttendanceSchema = new mongoose_1.Schema({
    month: { type: String, required: true },
    attendance: { type: Number, required: true },
});
const ChartConfigSchema = new mongoose_1.Schema({
    key: { type: String, required: true },
    label: { type: String, required: true },
    color: { type: String, required: true },
});
const BirthdayAnalyticsSchema = new mongoose_1.Schema({
    month: { type: String, required: true },
    celebrants: [
        {
            staffId: { type: String, required: true },
            firstName: { type: String, required: true },
            lastName: { type: String, required: true },
            dateOfBirth: { type: Date, required: true },
            profileImage: { type: String, required: false },
        },
    ],
});
const KeyMetricsSchema = new mongoose_1.Schema({
    employeeGrowth: {
        value: { type: Number, required: true },
        trend: { type: String, required: true },
    },
    avgSalary: {
        value: { type: Number, required: true },
        trend: { type: String, required: true },
    },
    leaveUtilization: {
        value: { type: Number, required: true },
        trend: { type: String, required: true },
    },
});
const DashboardCardsSchema = new mongoose_1.Schema({
    totalEmployees: {
        value: { type: Number, required: true },
        trend: { type: String, required: true },
    },
    activeLeave: {
        value: { type: Number, required: true },
        trend: { type: String, required: true },
    },
    appraisalsDue: {
        value: { type: Number, required: true },
        trend: { type: String, required: true },
    },
    completedTasks: {
        value: { type: Number, required: true },
        trend: { type: String, required: true },
    },
});
const RecentActivitySchema = new mongoose_1.Schema({
    message: { type: String, required: true },
    timestamp: { type: Date, required: true },
    type: { type: String, required: true },
});
// Main Analytics Schema
const AnalyticsSchema = new mongoose_1.Schema({
    company: {
        type: mongoose_1.default.Schema.Types.ObjectId,
        ref: 'Company',
        required: true,
        unique: true,
    },
    salaryDistributionByDept: [SalaryByDeptSchema],
    salaryDistributionByRole: [SalaryByRoleSchema],
    leaveTypesData: [LeaveAnalyticsSchema],
    hiringTrends: [HiringTrendSchema],
    attendanceData: [AttendanceSchema],
    chartConfig: [ChartConfigSchema],
    birthdayAnalytics: [BirthdayAnalyticsSchema],
    keyMetrics: KeyMetricsSchema,
    dashboardCards: DashboardCardsSchema,
    recentActivity: [RecentActivitySchema],
}, {
    timestamps: true,
    toJSON: {
        virtuals: true,
    },
    toObject: {
        virtuals: true,
    },
});
// Exports
const Analytics = mongoose_1.default.model('Analytics', AnalyticsSchema);
exports.default = Analytics;
