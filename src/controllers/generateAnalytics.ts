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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateAnalyticsAndDashboard = void 0;
const asyncHandler_1 = require("../middleware/asyncHandler");
const Analytics_1 = __importDefault(require("../models/Analytics"));
const Attendance_1 = __importDefault(require("../models/Attendance"));
const LeaveRequest_1 = __importStar(require("../models/LeaveRequest"));
const ErrorResponse_1 = __importDefault(require("../utils/ErrorResponse"));
const user_model_1 = __importDefault(require("../models/user.model"));
const AppraisalRequest_1 = __importDefault(require("../models/AppraisalRequest"));
/**
 * @desc Generates and retrieves company analytics data.
 * @route POST /api/v1/analytics/generate
* @access Private/Admin
 * @note This is a heavy operation and should be run on a schedule or as a one-off.
 */
exports.generateAnalyticsAndDashboard = (0, asyncHandler_1.asyncHandler)(async (req, res, next) => {
    try {
        const companyId = req.company?._id;
        if (!companyId) {
            return next(new ErrorResponse_1.default('Unauthorized or missing company context', 403));
        }
        // Check for an existing analytics document for the company.
        const existingAnalytics = await Analytics_1.default.findOne({ company: companyId });
        // Declare the 'now' variable once for use in multiple sections.
        const now = new Date();
        // -------------------- Aggregation Pipelines --------------------
        // 1. Aggregate Salary Distribution by Department
        const salaryDistributionByDept = await user_model_1.default.aggregate([
            { $match: { company: companyId, status: 'active' } },
            {
                $group: {
                    _id: '$department',
                    avgSalary: { $avg: '$accountInfo.basicPay' },
                    minSalary: { $min: '$accountInfo.basicPay' },
                    maxSalary: { $max: '$accountInfo.basicPay' },
                    employees: { $sum: 1 },
                },
            },
            {
                $project: {
                    _id: 0,
                    department: '$_id',
                    avgSalary: { $ifNull: ['$avgSalary', 0] },
                    minSalary: { $ifNull: ['$minSalary', 0] },
                    maxSalary: { $ifNull: ['$maxSalary', 0] },
                    employees: '$employees',
                },
            },
        ]);
        // 2. Aggregate Salary Distribution by Role
        const salaryDistributionByRole = await user_model_1.default.aggregate([
            { $match: { company: companyId, status: 'active' } },
            {
                $group: {
                    _id: '$position',
                    avgSalary: { $avg: '$accountInfo.basicPay' },
                    count: { $sum: 1 },
                },
            },
            {
                $project: {
                    _id: 0,
                    role: '$_id',
                    avgSalary: { $ifNull: ['$avgSalary', 0] },
                    count: '$count',
                    fill: { $literal: '#8884d8' },
                },
            },
        ]);
        // 3. Aggregate Leave Analytics
        const leaveTypesData = await LeaveRequest_1.default.aggregate([
            { $match: { company: companyId, status: 'Approved' } },
            {
                $group: {
                    _id: '$type',
                    used: { $sum: '$days' },
                },
            },
            {
                $project: {
                    _id: 0,
                    type: '$_id',
                    used: '$used',
                    total: {
                        $switch: {
                            branches: [
                                { case: { $eq: ['$_id', 'annual'] }, then: LeaveRequest_1.LeaveEntitlements.annual },
                                { case: { $eq: ['$_id', 'compassionate'] }, then: LeaveRequest_1.LeaveEntitlements.compassionate },
                                { case: { $eq: ['$_id', 'maternity'] }, then: LeaveRequest_1.LeaveEntitlements.maternity }
                            ],
                            default: 0
                        }
                    },
                    fill: { $literal: '#8884d8' },
                }
            }
        ]);
        // 4. Aggregate Hiring Trends for the last 12 months
        const today = new Date();
        const twelveMonthsAgo = new Date();
        twelveMonthsAgo.setMonth(today.getMonth() - 12);
        const hiringTrends = await user_model_1.default.aggregate([
            {
                $match: {
                    company: companyId,
                    $or: [
                        { employmentDate: { $gte: twelveMonthsAgo } },
                        { terminationDate: { $gte: twelveMonthsAgo } },
                    ],
                },
            },
            {
                $group: {
                    _id: {
                        year: { $year: { $ifNull: ['$employmentDate', '$terminationDate'] } },
                        month: { $month: { $ifNull: ['$employmentDate', '$terminationDate'] } },
                    },
                    hires: {
                        $sum: { $cond: [{ $ifNull: ['$employmentDate', false] }, 1, 0] },
                    },
                    terminations: {
                        $sum: { $cond: [{ $ifNull: ['$terminationDate', false] }, 1, 0] },
                    },
                },
            },
            {
                $sort: { '_id.year': 1, '_id.month': 1 },
            },
            {
                $project: {
                    _id: 0,
                    month: {
                        $dateToString: {
                            format: '%b',
                            date: {
                                $dateFromParts: {
                                    year: '$_id.year',
                                    month: '$_id.month',
                                },
                            },
                        },
                    },
                    hires: '$hires',
                    terminations: '$terminations',
                },
            },
        ]);
        // 5. Aggregate Attendance Data
        const attendanceData = await Attendance_1.default.aggregate([
            { $match: { company: companyId, status: { $ne: 'on_leave' } } },
            {
                $group: {
                    _id: {
                        year: { $year: '$createdAt' },
                        month: { $month: '$createdAt' },
                    },
                    totalDays: { $sum: 1 },
                    presentDays: {
                        $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] },
                    },
                },
            },
            {
                $project: {
                    _id: 0,
                    month: {
                        $dateToString: {
                            format: '%b',
                            date: {
                                $dateFromParts: {
                                    year: '$_id.year',
                                    month: '$_id.month',
                                },
                            },
                        },
                    },
                    attendance: {
                        $round: [{ $multiply: [{ $divide: ['$presentDays', '$totalDays'] }, 100] }, 2],
                    },
                },
            },
        ]);
        // 6. Aggregate Birthday Data
        const birthdayAnalytics = await user_model_1.default.aggregate([
            { $match: { company: companyId, dateOfBirth: { $exists: true }, staffId: { $exists: true, $ne: null } } },
            {
                $group: {
                    _id: { $month: "$dateOfBirth" },
                    celebrants: {
                        $push: {
                            staffId: "$staffId",
                            firstName: "$firstName",
                            lastName: "$lastName",
                            dateOfBirth: "$dateOfBirth",
                            profileImage: "$profileImage",
                        },
                    },
                },
            },
            { $sort: { _id: 1 } },
            {
                $project: {
                    _id: 0,
                    month: {
                        $dateToString: {
                            format: "%b",
                            date: {
                                $dateFromParts: {
                                    year: { $year: new Date() },
                                    month: "$_id",
                                },
                            },
                        },
                    },
                    celebrants: "$celebrants",
                },
            },
        ]);
        // 7. Calculate Key Metrics
        const lastQuarterStart = new Date(now.getFullYear(), now.getMonth() - 3, 1);
        const lastQuarterEnd = new Date(now.getFullYear(), now.getMonth(), 0);
        const employeesNow = await user_model_1.default.countDocuments({ company: companyId, status: 'active' });
        const employeesLastQuarter = await user_model_1.default.countDocuments({
            company: companyId,
            status: 'active',
            employmentDate: { $lte: lastQuarterEnd },
        });
        const employeeGrowthValue = employeesLastQuarter > 0 ? ((employeesNow - employeesLastQuarter) / employeesLastQuarter) * 100 : 0;
        const avgSalaryData = await user_model_1.default.aggregate([
            { $match: { company: companyId, status: 'active' } },
            { $group: { _id: null, avgSalary: { $avg: '$accountInfo.basicPay' } } },
        ]);
        const avgSalaryValue = avgSalaryData[0]?.avgSalary || 0;
        const totalLeaveUsed = await LeaveRequest_1.default.aggregate([
            { $match: { company: companyId, status: 'Approved' } },
            { $group: { _id: null, totalDays: { $sum: '$days' } } },
        ]);
        const totalLeaveUsedDays = totalLeaveUsed.length > 0 ? totalLeaveUsed[0]?.totalDays : 0;
        const totalLeaveAllocated = employeesNow * (LeaveRequest_1.LeaveEntitlements.annual + LeaveRequest_1.LeaveEntitlements.compassionate + LeaveRequest_1.LeaveEntitlements.maternity);
        const leaveUtilizationValue = totalLeaveAllocated > 0 ? (totalLeaveUsedDays / totalLeaveAllocated) * 100 : 0;
        const keyMetrics = {
            employeeGrowth: {
                value: parseFloat(employeeGrowthValue.toFixed(1)),
                trend: 'vs last quarter',
            },
            avgSalary: {
                value: parseFloat(avgSalaryValue.toFixed(2)),
                trend: '+3.5% YoY', // Placeholder, needs more complex aggregation for YoY
            },
            leaveUtilization: {
                value: parseFloat(leaveUtilizationValue.toFixed(1)),
                trend: 'Of allocated leave',
            },
        };
        // 8. Calculate Dashboard Card Values
        const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
        const employeesLastMonth = await user_model_1.default.countDocuments({
            company: companyId,
            status: 'active',
            employmentDate: { $lte: lastMonthEnd },
        });
        const totalEmployeesTrend = employeesNow - employeesLastMonth;
        const activeLeave = await LeaveRequest_1.default.countDocuments({
            company: companyId,
            status: 'Approved',
            startDate: { $lte: now },
            endDate: { $gte: now },
        });
        const pendingLeave = await LeaveRequest_1.default.countDocuments({
            company: companyId,
            status: 'Pending',
        });
        // Dynamically calculate appraisals due for this month
        const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        const appraisalsDue = await AppraisalRequest_1.default.countDocuments({
            company: companyId,
            status: 'pending',
            dueDate: { $gte: currentMonthStart, $lt: nextMonthStart }
        });
        // NOTE: The 'Task' model was not provided. The completed tasks card uses placeholder data.
        // To make this dynamic, you must provide the Mongoose model for this feature.
        const completedTasks = 128;
        const completedTasksLastWeek = 113; // Example value
        const completedTasksTrend = completedTasks - completedTasksLastWeek;
        const dashboardCards = {
            totalEmployees: {
                value: employeesNow,
                trend: `+${totalEmployeesTrend} from last month`,
            },
            activeLeave: {
                value: activeLeave,
                trend: `${pendingLeave} pending approval`,
            },
            appraisalsDue: {
                value: appraisalsDue,
                trend: `This month`,
            },
            completedTasks: {
                value: completedTasks,
                trend: `+${completedTasksTrend} from last week`,
            },
        };
        // 9. Fetch Recent Activity
        const recentHires = (await user_model_1.default.find({ company: companyId }).sort({ employmentDate: -1 }).limit(2).lean());
        const recentLeaves = (await LeaveRequest_1.default.find({ company: companyId, status: 'Approved' }).sort({ updatedAt: -1 }).limit(2).lean());
        // Dynamically fetch recent appraisals, as the model was provided.
        const recentAppraisals = (await AppraisalRequest_1.default.find({ company: companyId, status: 'submitted' }).sort({ updatedAt: -1 }).limit(2).lean());
        // NOTE: Placeholder data for 'Task' model, as it was not provided.
        const recentTasks = [{ message: 'New employee onboarded', createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000) }];
        const recentActivity = [
            ...recentHires.map((h) => ({
                message: `New employee ${h.firstName} onboarded`,
                timestamp: h.employmentDate || new Date(),
                type: 'onboarding'
            })),
            ...recentLeaves.map((l) => ({
                message: `Leave request approved`,
                timestamp: l.updatedAt || new Date(),
                type: 'leave'
            })),
            ...recentAppraisals.map((a) => ({
                message: `Appraisal for ${a.title} submitted`,
                timestamp: a.updatedAt || new Date(),
                type: 'appraisal'
            })),
            ...recentTasks.map((t) => ({
                message: t.message,
                timestamp: t.createdAt,
                type: 'task'
            })),
        ];
        // Sort recent activity by timestamp in descending order and take the top 5
        recentActivity.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
        const topRecentActivity = recentActivity.slice(0, 5);
        // -------------------- Create and Save Analytics Document --------------------
        let analytics;
        const analyticsData = {
            salaryDistributionByDept,
            salaryDistributionByRole,
            leaveTypesData,
            hiringTrends,
            attendanceData,
            chartConfig: [
                { key: 'hires', label: 'Hires', color: '#8884d8' },
                { key: 'terminations', label: 'Terminations', color: '#ffc658' },
            ],
            birthdayAnalytics,
            keyMetrics,
            dashboardCards,
            recentActivity: topRecentActivity,
        };
        if (existingAnalytics) {
            analytics = await Analytics_1.default.findOneAndUpdate({ company: companyId }, analyticsData, { new: true, runValidators: true });
        }
        else {
            analytics = await Analytics_1.default.create({
                company: companyId,
                ...analyticsData,
            });
        }
        return res.status(existingAnalytics ? 200 : 201).json({
            success: true,
            data: {
                analytics,
            },
        });
    }
    catch (err) {
        next(new ErrorResponse_1.default(err.message, 500));
    }
});
