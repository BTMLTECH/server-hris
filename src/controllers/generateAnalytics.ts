import { NextFunction } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import Analytics, {
  ISalaryByDept,
  ISalaryByRole,
  ILeaveAnalytics,
  IHiringTrend,
  IBirthdayAnalytics,
  IKeyMetrics,
  IDashboardCards,
  IRecentActivity,
} from '../models/Analytics';
import Attendance, { IAttendance } from '../models/Attendance';
import LeaveRequest, { ILeaveRequest, LeaveEntitlements } from '../models/LeaveRequest';
import { TypedRequest } from '../types/typedRequest';
import { TypedResponse } from '../types/typedResponse';
import ErrorResponse from '../utils/ErrorResponse';
import User, { IUser } from '../models/user.model';
import AppraisalRequest, { IAppraisalRequest } from '../models/AppraisalRequest';
import Birthday from '../models/Birthday';

/**
 * @desc Generates and retrieves company analytics data.
 * @route POST /api/v1/analytics/generate
 * @access Private/Admin
 * @note This is a heavy operation and should be run on a schedule or as a one-off.
 */
export const generateAnalyticsAndDashboard = asyncHandler(
  async (req: TypedRequest<{}, {}, {}>, res: TypedResponse<any>, next: NextFunction) => {
    try {
      const companyId = req.company?._id;

      if (!companyId) {
        return next(new ErrorResponse('Unauthorized or missing company context', 403));
      }

      const existingAnalytics = await Analytics.findOne({ company: companyId });

      const now = new Date();

      const salaryDistributionByDept: ISalaryByDept[] = await User.aggregate([
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

      const salaryDistributionByRole: ISalaryByRole[] = await User.aggregate([
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

      const leaveTypesData: ILeaveAnalytics[] = await LeaveRequest.aggregate([
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
                  { case: { $eq: ['$_id', 'annual'] }, then: LeaveEntitlements.annual },
                  {
                    case: { $eq: ['$_id', 'compassionate'] },
                    then: LeaveEntitlements.compassionate,
                  },
                  { case: { $eq: ['$_id', 'maternity'] }, then: LeaveEntitlements.maternity },
                ],
                default: 0,
              },
            },
            fill: { $literal: '#8884d8' },
          },
        },
      ]);

      const today = new Date();
      const twelveMonthsAgo = new Date();
      twelveMonthsAgo.setMonth(today.getMonth() - 12);

      const hiringTrends: IHiringTrend[] = await User.aggregate([
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

      const attendanceData: IAttendance[] = await Attendance.aggregate([
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

      const birthdayAnalytics: IBirthdayAnalytics[] = await Birthday.aggregate([
        {
          $match: {
            company: companyId,
            staffId: { $exists: true, $ne: null },
          },
        },
        {
          $group: {
            _id: '$month',
            celebrants: {
              $push: {
                staffId: '$staffId',
                firstName: '$firstName',
                lastName: '$lastName',
                dateOfBirth: '$dateOfBirth',
                profileImage: '$profileImage',
              },
            },
          },
        },
        {
          $sort: { _id: 1 },
        },
        {
          $project: {
            _id: 0,
            month: {
              $dateToString: {
                format: '%b',
                date: {
                  $dateFromParts: {
                    year: new Date().getFullYear(),
                    month: '$_id',
                    day: 1,
                  },
                },
              },
            },
            celebrants: 1,
          },
        },
      ]);

      // 7. Calculate Key Metrics
      const lastQuarterEnd = new Date(now.getFullYear(), now.getMonth(), 0);

      const employeesNow = await User.countDocuments({ company: companyId, status: 'active' });
      const employeesLastQuarter = await User.countDocuments({
        company: companyId,
        status: 'active',
        employmentDate: { $lte: lastQuarterEnd },
      });

      const employeeGrowthValue =
        employeesLastQuarter > 0
          ? ((employeesNow - employeesLastQuarter) / employeesLastQuarter) * 100
          : 0;

      const avgSalaryData = await User.aggregate([
        { $match: { company: companyId, status: 'active' } },
        { $group: { _id: null, avgSalary: { $avg: '$accountInfo.basicPay' } } },
      ]);
      const avgSalaryValue = avgSalaryData[0]?.avgSalary || 0;

      const totalLeaveUsed = await LeaveRequest.aggregate([
        { $match: { company: companyId, status: 'Approved' } },
        { $group: { _id: null, totalDays: { $sum: '$days' } } },
      ]);

      const totalLeaveUsedDays = totalLeaveUsed.length > 0 ? totalLeaveUsed[0]?.totalDays : 0;
      const totalLeaveAllocated =
        employeesNow *
        (LeaveEntitlements.annual + LeaveEntitlements.compassionate + LeaveEntitlements.maternity);
      const leaveUtilizationValue =
        totalLeaveAllocated > 0 ? (totalLeaveUsedDays / totalLeaveAllocated) * 100 : 0;

      const keyMetrics: IKeyMetrics = {
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

      const employeesLastMonth = await User.countDocuments({
        company: companyId,
        status: 'active',
        employmentDate: { $lte: lastMonthEnd },
      });
      const totalEmployeesTrend = employeesNow - employeesLastMonth;

      const activeLeave = await LeaveRequest.find({        
          status: 'Approved',
          isActive: true,
          returned: false,
        })
          .populate('user', 'staffId firstName lastName email department profileImage')
          .lean();


      // const activeLeave = await LeaveRequest.countDocuments({
      //   company: companyId,
      //   status: 'Approved',
      //   startDate: { $lte: now },
      //   endDate: { $gte: now },
      // });
       const pendingLeave = await LeaveRequest.find({       
        status: 'Pending',
        isActive: false,
        returned: false,
        })
          .populate('user', 'staffId firstName lastName email department profileImage')
          .lean();
      // const pendingLeave = await LeaveRequest.countDocuments({
      //   company: companyId,
      //   status: 'Pending',
      // });



      const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const appraisalsDue = await AppraisalRequest.countDocuments({
        company: companyId,
        status: 'pending',
        dueDate: { $gte: currentMonthStart, $lt: nextMonthStart },
      });

      const completedTasks = 128;
      const completedTasksLastWeek = 113; // Example value
      const completedTasksTrend = completedTasks - completedTasksLastWeek;

      const dashboardCards: IDashboardCards = {
        totalEmployees: {
          value: employeesNow,
          trend: `+${totalEmployeesTrend} from last month`,
        },
        activeLeave: {
          value: activeLeave,
          trend: pendingLeave,
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

      const recentHires = (await User.find({ company: companyId })
        .sort({ employmentDate: -1 })
        .limit(2)
        .lean()) as (IUser & { updatedAt?: Date })[];
      const recentLeaves = (await LeaveRequest.find({ company: companyId, status: 'Approved' })
        .sort({ updatedAt: -1 })
        .limit(2)
        .lean()) as (ILeaveRequest & { updatedAt?: Date })[];

      const recentAppraisals = (await AppraisalRequest.find({
        company: companyId,
        status: 'submitted',
      })
        .sort({ updatedAt: -1 })
        .limit(2)
        .lean()) as (IAppraisalRequest & { updatedAt?: Date })[];

      const recentTasks = [
        { message: 'New employee onboarded', createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000) },
      ];

      const recentActivity: IRecentActivity[] = [
        ...recentHires.map(
          (h): IRecentActivity => ({
            message: `New employee ${h.firstName} onboarded`,
            timestamp: h.employmentDate || new Date(),
            type: 'onboarding',
          }),
        ),
        ...recentLeaves.map(
          (l): IRecentActivity => ({
            message: `Leave request approved`,
            timestamp: l.updatedAt || new Date(),
            type: 'leave',
          }),
        ),
        ...recentAppraisals.map(
          (a): IRecentActivity => ({
            message: `Appraisal for ${a.title} submitted`,
            timestamp: a.updatedAt || new Date(),
            type: 'appraisal',
          }),
        ),
        ...recentTasks.map(
          (t): IRecentActivity => ({
            message: t.message,
            timestamp: t.createdAt,
            type: 'task',
          }),
        ),
      ];

      recentActivity.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      const topRecentActivity = recentActivity.slice(0, 5);
      
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
        analytics = await Analytics.findOneAndUpdate({ company: companyId }, analyticsData, {
          new: true,
          runValidators: true,
        });
        
      } else {
        analytics = await Analytics.create({
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
    } catch (err: any) {
      next(new ErrorResponse(err.message, 500));
    }
  },
);
