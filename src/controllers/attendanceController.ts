import ExcelJS from 'exceljs';
import { NextFunction, Response } from 'express';
import Attendance, { IAttendance } from '../models/Attendance';
import User, { IUser } from '../models/user.model';
import { TypedRequest } from '../types/typedRequest';
import { TypedResponse } from '../types/typedResponse';
import ErrorResponse from '../utils/ErrorResponse';
import { sendNotification } from '../utils/sendNotification';
import { formatHours, getCurrentShift } from '../utils/shiftUtils';
import { generateRandomPassword } from '../utils/passwordValidator';
import mongoose, { isValidObjectId, Types } from 'mongoose';
import {
  BiometryCheckInDto,
  BiometryCheckInResponse,
  ManualCheckInDto,
  AttendanceHistoryResponse,
  AdminAttendanceReportQuery,
  EmployeeAttendanceStatsResponse,
  CompanyAttendanceSummaryQuery,
  CompanyAttendanceSummaryResponse,
  AttendanceFilterQuery,
  AttendanceHistoryQuery,
} from '../types/attendanceType';
import { asyncHandler } from '../middleware/asyncHandler';
import { ICompany } from '../models/Company';

// 🔐 OFFICE BIOMETRY CHECK-IN
export const biometryCheckIn = asyncHandler(
  async (req: TypedRequest<{}, {}, { biometryId?: string }>, res: Response, next: NextFunction) => {
    try {
      const { biometryId } = req.body;

      if (!biometryId) {
        return next(new ErrorResponse('Missing biometryId', 400));
      }

      const user = await User.findOne({ biometryId });
      if (!user || !user.isActive) {
        return next(new ErrorResponse('Invalid or inactive user', 404));
      }

      const { shift, startTime } = getCurrentShift();
      const date = new Date().toISOString().split('T')[0];

      const existing = await Attendance.findOne({
        user: user._id as Types.ObjectId,
        shift,
        date,
      });

      if (existing) {
        return next(new ErrorResponse('Already clocked in for this shift', 400));
      }

      const now = new Date();
      const status: IAttendance['status'] = now > startTime ? 'late' : 'present';

      const attendance: IAttendance = await Attendance.create({
        user: user._id as Types.ObjectId,
        biometryId, // ⚡ You had this in your original compiled code, so I kept it
        shift,
        checkIn: now,
        status,
        date,
        isCheckedIn: true,
        company: user.company as Types.ObjectId,
        department: user.department,
      });

      if (status === 'late') {
        const checkInTime = now.toTimeString().split(' ')[0];
        await sendNotification({
          user,
          type: 'WARNING',
          title: 'Late Check-In',
          message: `You checked in late for your ${shift} shift on ${date}`,
          metadata: { date, shift, checkInTime },
          emailSubject: 'Late Check-In Alert',
          emailTemplate: 'late-notification.ejs',
          emailData: {
            name: user.firstName,
            date,
            shift,
            checkInTime,
          },
        });
      }

      res.status(201).json({
        success: true,
        data: { data: attendance },
      });
    } catch (error: any) {
      next(new ErrorResponse(error.message, 500));
    }
  },
);

// 🔐 REMOTE MANUAL CHECK-IN (AUTH REQUIRED)
export const manualCheckIn = asyncHandler(
  async (
    req: TypedRequest<{}, {}, { shift?: 'day' | 'night' }>,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const company = req.company;
      const user = await User.findById(req.user?.id);

      if (!user || !user.isActive) {
        return next(new ErrorResponse('Invalid or inactive user', 404));
      }

      const { shift: overrideShift } = req.body;

      const { shift, startTime } = overrideShift
        ? getCurrentShift(overrideShift)
        : getCurrentShift();

      const date = new Date().toISOString().split('T')[0];

      const existing = await Attendance.findOne({
        user: user._id as Types.ObjectId,
        shift,
        date,
      });

      if (existing) {
        if (existing.checkOut) {
          return next(new ErrorResponse('You have already checked out for this shift', 400));
        }
        return next(new ErrorResponse('Already clocked in for this shift', 400));
      }

      const now = new Date();
      const status: IAttendance['status'] = now > startTime ? 'late' : 'present';

      const attendance: IAttendance = await Attendance.create({
        user: user._id as Types.ObjectId,
        // biometryId: user.biometryId,
        shift,
        checkIn: now,
        status,
        date,
        isCheckedIn: true,
        company: user.company as Types.ObjectId,
        department: user.department,
      });

      if (status === 'late') {
        const checkInTime = now.toTimeString().split(' ')[0];
        await sendNotification({
          user,
          type: 'WARNING',
          title: 'Late Check-In',
          message: `You checked in late for your ${shift} shift on ${date}`,
          metadata: { date, shift, checkInTime },
          emailSubject: 'Late Check-In Alert',
          emailTemplate: 'late-notification.ejs',
          emailData: {
            name: user.firstName,
            date,
            shift,
            checkInTime,
            companyName: company?.branding?.displayName || company?.name,
            logoUrl: company?.branding?.logoUrl,
            primaryColor: company?.branding?.primaryColor || '#0621b6b0',
          },
        });
      }

      res.status(201).json({
        success: true,
        data: {
          data: attendance,
        },
      });
    } catch (error: any) {
      next(new ErrorResponse(error.message, 500));
    }
  },
);

// 🔐 OFFICE BIOMETRY CHECK-OUT
export const biometryCheckOut = asyncHandler(
  async (req: TypedRequest<{}, {}, { biometryId?: string }>, res: Response, next: NextFunction) => {
    try {
      const { biometryId } = req.body;

      if (!biometryId) {
        return next(new ErrorResponse('Missing biometryId', 400));
      }

      const user = await User.findOne({ biometryId });

      if (!user || !user.isActive) {
        return next(new ErrorResponse('Invalid or inactive user', 404));
      }

      const { shift, endTime } = getCurrentShift();
      const date = new Date().toISOString().split('T')[0];

      const record = await Attendance.findOne({
        user: user._id,
        shift,
        date,
      });

      if (!record || record.checkOut) {
        return next(new ErrorResponse('Not clocked in or already clocked out', 400));
      }

      const now = new Date();
      const workedHours = +(Math.abs(now.getTime() - record.checkIn.getTime()) / 36e5).toFixed(2);

      record.checkOut = now;
      record.hoursWorked = workedHours;
      record.isCheckedIn = false;

      const isEarly = now < endTime;

      if (isEarly) {
        await sendNotification({
          user,
          type: 'WARNING',
          title: 'Early Check-Out',
          message: `You checked out early for your ${shift} shift on ${date}`,
          metadata: {
            date,
            shift,
            checkOutTime: now.toTimeString().split(' ')[0],
          },
          emailSubject: 'Early Check-Out Alert',
          emailTemplate: 'early-checkout-notification.ejs',
          emailData: {
            name: user.firstName,
            date,
            shift,
            checkOutTime: now.toTimeString().split(' ')[0],
          },
        });
      }

      await record.save();

      res.status(200).json({
        success: true,
        data: {
          data: record,
        },
      });
    } catch (error: any) {
      next(new ErrorResponse(error.message, 500));
    }
  },
);

export const manualCheckOut = asyncHandler(
  async (
    req: TypedRequest<{}, {}, { shift?: 'day' | 'night' }>,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const user = await User.findById(req.user?.id);

      if (!user || !user.isActive) {
        return next(new ErrorResponse('Invalid or inactive user', 404));
      }

      const { shift: overrideShift } = req.body;

      const { shift, endTime } = overrideShift ? getCurrentShift(overrideShift) : getCurrentShift();

      const date = new Date().toISOString().split('T')[0];

      const record = await Attendance.findOne({
        user: user._id as Types.ObjectId,
        shift,
        date,
      });

      if (!record || record.checkOut) {
        return next(new ErrorResponse('Not clocked in or already clocked out', 400));
      }

      const now = new Date();

      // Clamp clock-out time to shift end time if user clocks out late
      const effectiveClockOut = now > endTime ? endTime : now;

      // Calculate hours worked between check-in and effective clock-out
      const workedHours = +(
        (effectiveClockOut.getTime() - record.checkIn.getTime()) /
        36e5
      ).toFixed(2);

      // Update record
      record.checkOut = now;
      record.hoursWorked = workedHours;
      record.isCheckedIn = false;

      // Early checkout detection
      const isEarly = now < endTime;

      if (isEarly) {
        await sendNotification({
          user,
          type: 'WARNING',
          title: 'Early Check-Out',
          message: `You checked out early for your ${shift} shift on ${date}`,
          metadata: { date, shift, checkOutTime: now.toTimeString().split(' ')[0] },
          emailSubject: 'Early Check-Out Alert',
          emailTemplate: 'early-checkout-notification.ejs',
          emailData: {
            name: user.firstName,
            date,
            shift,
            checkOutTime: now.toTimeString().split(' ')[0],
          },
        });
      }

      await record.save();

      res.status(200).json({
        success: true,
        data: {
          data: record,
        },
      });
    } catch (error: any) {
      next(new ErrorResponse(error.message, 500));
    }
  },
);

export const getAttendanceHistory = asyncHandler(
  async (req: TypedRequest<{}, AttendanceHistoryQuery, {}>, res: Response, _next: NextFunction) => {
    const user = req.user;

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
        data: {
          data: [],
          pagination: { total: 0, page: 1, limit: 20, pages: 1 },
          count: 0,
        },
      });
    }

    const { startDate, endDate, department, shift, company, page = 1, limit = 20 } = req.query;

    const query: Record<string, any> = {};

    const isRestricted = ['employee', 'teamlead', 'md'].includes(user.role);

    if (isRestricted) {
      query.user = user.id;
    } else {
      if (department && isValidObjectId(department)) {
        query.department = department;
      }
      if (shift) {
        query.shift = shift;
      }
      if (company && isValidObjectId(company)) {
        query.company = company;
      }
    }

    // Date filtering
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
        query.date = { $gte: start, $lte: end };
      }
    }

    const pageNum = Math.max(Number(page), 1);
    const limitNum = Math.min(Math.max(Number(limit), 1), 100);
    const skip = (pageNum - 1) * limitNum;

    const [attendanceRecords, total] = await Promise.all([
      Attendance.find(query)
        .populate<{ user: IUser }>('user', 'staffId firstName lastName email role')
        .sort({ date: -1 })
        .skip(skip)
        .limit(limitNum),
      Attendance.countDocuments(query),
    ]);

    const pages = Math.ceil(total / limitNum);

    res.status(200).json({
      success: true,
      data: {
        data: attendanceRecords,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          pages,
        },
        count: 0,
      },
    });
  },
);

export const adminAttendanceReport = asyncHandler(
  async (req: TypedRequest<{}, AttendanceHistoryQuery, {}>, res: Response, _next: NextFunction) => {
    const { startDate, endDate, department, shift, company, page = '1', limit = '20' } = req.query;

    const query: Record<string, any> = {};

    // Date filter
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
        query.date = { $gte: start, $lte: end };
      }
    }

    // Optional filters
    if (department && isValidObjectId(department)) {
      query.department = department;
    }
    if (shift) {
      query.shift = shift;
    }
    if (company && isValidObjectId(company)) {
      query.company = company;
    }

    // Pagination
    const pageNum = Math.max(parseInt(page, 10), 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10), 1), 100);
    const skip = (pageNum - 1) * limitNum;

    const [attendanceRecords, total] = await Promise.all([
      Attendance.find(query)
        .populate('user', 'firstName lastName email role')
        .sort({ date: -1 })
        .skip(skip)
        .limit(limitNum),
      Attendance.countDocuments(query),
    ]);

    res.status(200).json({
      success: true,
      data: {
        count: total,
        page: pageNum,
        pageSize: attendanceRecords.length,
        data: attendanceRecords,
      },
    });
  },
);

export const getEmployeeAttendanceStats = asyncHandler(
  async (req: TypedRequest, res: Response, _next: NextFunction) => {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    const totalDays = await Attendance.countDocuments({ user: userId });

    const lateDays = await Attendance.countDocuments({
      user: userId,
      status: 'late',
    });
    const presentDays = await Attendance.countDocuments({
      user: userId,
      status: 'present',
    });

    const hoursData = await Attendance.aggregate([
      { $match: { user: req.user?._id } },
      { $group: { _id: null, totalHours: { $sum: '$hoursWorked' } } },
    ]);

    res.status(200).json({
      success: true,
      data: {
        data: {
          totalDays,
          lateDays,
          presentDays,
          totalHoursWorked: hoursData[0]?.totalHours || 0,
          latePercentage: totalDays ? Math.round((lateDays / totalDays) * 100) : 0,
        },
      },
    });
  },
);

export const getCompanyAttendanceSummary = asyncHandler(
  async (req: TypedRequest, res: Response, _next: NextFunction) => {
    const requester = await User.findById(req.user?.id);

    if (!requester || !requester.company) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized: User is not associated with any company.',
      });
    }

    const companyId = requester.company;
    const today = new Date().toISOString().split('T')[0];

    const totalEmployees = await User.countDocuments({
      company: companyId,
      role: 'employee', // lowercase, consistent with your model usage
      isActive: true,
    });

    // Attendance records for today
    const todayRecords: Pick<IAttendance, 'user' | 'shift'>[] = await Attendance.find({
      company: companyId,
      date: today,
    }).select('user shift');

    // Deduplicate by user
    const uniqueUserIds = new Set(todayRecords.map((r) => r.user.toString()));
    const attendedToday = uniqueUserIds.size;

    // Shift breakdown
    const dayShift = todayRecords.filter((r) => r.shift === 'day').length;
    const nightShift = todayRecords.filter((r) => r.shift === 'night').length;

    const attendanceRate = totalEmployees ? Math.round((attendedToday / totalEmployees) * 100) : 0;

    return res.status(200).json({
      success: true,
      data: {
        data: {
          totalEmployees,
          dayShift,
          nightShift,
          attendanceRate,
        },
      },
    });
  },
);

export const markAbsentees = asyncHandler(async () => {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const date = yesterday.toISOString().split('T')[0];

  // Fetch active employees
  const employees: IUser[] = await User.find({
    role: 'employee', // lowercase to match your role system
    isActive: true,
  });

  for (const user of employees) {
    const hasAttendance = await Attendance.findOne({
      user: user._id,
      date,
    });

    if (!hasAttendance) {
      await Attendance.create({
        user: user._id,
        // biometryId: user.biometryId,
        shift: 'day', // fallback
        status: 'absent',
        checkIn: undefined,
        date,
        company: user.company,
        department: user.department,
      });
    }

    await sendNotification({
      user,
      type: 'WARNING',
      title: 'Absence Detected',
      message: `You were marked absent on ${date}`,
      metadata: { date, shift: 'day' },
      emailSubject: 'You were marked absent',
      emailTemplate: 'absence-notification.ejs',
      emailData: {
        name: user.firstName,
        date,
        shift: 'day',
        companyName:
          typeof user.company === 'object' && 'name' in user.company
            ? (user.company as any).name
            : '',
        logoUrl:
          typeof user.company === 'object' &&
          'branding' in user.company &&
          (user.company as any).branding?.logoUrl
            ? (user.company as any).branding.logoUrl
            : '',
        primaryColor:
          typeof user.company === 'object' &&
          'branding' in user.company &&
          (user.company as any).branding?.primaryColor
            ? (user.company as any).branding.primaryColor
            : '#0621b6b0',
      },
    });
  }
});

export const exportAttendanceExcel = asyncHandler(
  async (
    req: TypedRequest<
      {},
      {
        startDate?: string;
        endDate?: string;
        department?: string;
        shift?: 'day' | 'night';
        company?: string;
      },
      {}
    >,
    res: Response,
  ) => {
    const { startDate, endDate, department, shift, company } = req.query;

    const query: Record<string, any> = {};
    if (startDate && endDate) {
      query.date = { $gte: startDate, $lte: endDate };
    }
    if (department) query.department = department;
    if (shift) query.shift = shift;
    if (company) query.company = company;

    const records = await Attendance.find(query)
      .populate<{ user: IUser }>('user', 'firstName lastName email role')
      .sort({ date: 1 });

    // Create workbook and worksheet
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Attendance Report');

    worksheet.columns = [
      { header: 'Date', key: 'date', width: 15 },
      { header: 'Name', key: 'name', width: 25 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'Role', key: 'role', width: 15 },
      { header: 'Shift', key: 'shift', width: 15 },
      { header: 'Check In', key: 'checkIn', width: 20 },
      { header: 'Check Out', key: 'checkOut', width: 20 },
      { header: 'Hours Worked', key: 'hoursWorked', width: 15 },
      { header: 'Status', key: 'status', width: 15 },
      // { header: "Biometry ID", key: "biometryId", width: 20 },
    ];

    // Safely process records with populated user
    records.forEach((record) => {
      const user = record.user as IUser;

      if (user?.firstName && user?.lastName && user?.email && user?.role) {
        worksheet.addRow({
          date: record.date,
          name: `${user.firstName} ${user.lastName}`,
          email: user.email,
          role: user.role,
          shift: record.shift,
          checkIn: record.checkIn ? new Date(record.checkIn).toLocaleString() : '',
          checkOut: record.checkOut ? new Date(record.checkOut).toLocaleString() : '',
          hoursWorked: record.hoursWorked || 0,
          status: record.status,
          // biometryId: record.biometryId,
        });
      }
    });

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename=attendance_${Date.now()}.xlsx`);

    await workbook.xlsx.write(res);
    res.end();
  },
);

export const autoCheckoutForgotten = async (): Promise<void> => {
  const now = new Date();

  const activeRecords = await Attendance.find({
    isCheckedIn: true,
    checkOut: { $exists: false },
  })
    .populate<{ user: IUser }>('user')
    .sort({ createdAt: -1 });

  for (const record of activeRecords) {
    const baseDate = new Date(record.date);

    const { endTime } = getCurrentShift(record.shift, baseDate);

    if (now > endTime) {
      const workedHours = +(
        Math.abs(endTime.getTime() - new Date(record.checkIn).getTime()) / 36e5
      ).toFixed(2);

      record.checkOut = endTime;
      record.hoursWorked = workedHours;
      record.isCheckedIn = false;

      await record.save();
    }
  }
};
