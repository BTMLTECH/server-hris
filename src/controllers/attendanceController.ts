import ExcelJS from 'exceljs';
import { NextFunction, Response } from 'express';
import Attendance from '../models/Attendance';
import User, { IUser } from '../models/user.model';
import { TypedRequest } from '../types/typedRequest';
import { TypedResponse } from '../types/typedResponse';
import ErrorResponse from '../utils/ErrorResponse';
import { sendNotification } from '../utils/sendNotification';
import { formatHours, getCurrentShift } from '../utils/shiftUtils';
import { generateRandomPassword } from '../utils/passwordValidator';
import mongoose, { isValidObjectId } from 'mongoose';
import { BiometryCheckInDto, BiometryCheckInResponse, ManualCheckInDto, AttendanceHistoryResponse, AdminAttendanceReportQuery, EmployeeAttendanceStatsResponse, CompanyAttendanceSummaryQuery, CompanyAttendanceSummaryResponse, AttendanceFilterQuery } from '../types/attendanceType';
import { asyncHandler } from '../middleware/asyncHandler';

// 🔐 OFFICE BIOMETRY CHECK-IN
export const biometryCheckIn = asyncHandler(async (
  req: TypedRequest<{}, {}, BiometryCheckInDto>, res: TypedResponse<BiometryCheckInResponse>, next: NextFunction
) => {
  const { biometryId } = req.body;
  if (!biometryId) return next(new ErrorResponse('Missing biometryId', 400));

  const user = await User.findOne({ biometryId });
  if (!user || !user.isActive) return next(new ErrorResponse('Invalid or inactive user', 404));

  const { shift, startTime } = getCurrentShift();
  const date = new Date().toISOString().split('T')[0];

  const existing = await Attendance.findOne({ user: user._id, shift, date });
  if (existing) return next(new ErrorResponse('Already clocked in for this shift', 400));

  const now = new Date();
  const status = now > startTime ? 'late' : 'present';

  const attendance = await Attendance.create({
    user: user._id,
    biometryId,
    shift,
    checkIn: now,
    status,
    date,
    isCheckedIn: true,
    company: user.company,
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

  res.status(201).json({ success: true, data: {
    data: attendance,
  } });
});


// 🔐 REMOTE MANUAL CHECK-IN (AUTH REQUIRED)
export const manualCheckIn = asyncHandler(
  async (
    req: TypedRequest<{}, {}, ManualCheckInDto>,
    res: TypedResponse<BiometryCheckInResponse>,
    next: NextFunction
  ) => {



    const user = await User.findById(req.user?.id);
  

    if (!user || !user.isActive) {
      return next(new ErrorResponse('Invalid or inactive user', 404));
    }

    const { shift: overrideShift } = req.body;
    const { shift, startTime } = overrideShift
      ? getCurrentShift(overrideShift)
      : getCurrentShift();

    const date = new Date().toISOString().split('T')[0];

    // const existing = await Attendance.findOne({ user: user._id, shift, date });
    // if (existing) {
    //   return next(new ErrorResponse('Already clocked in for this shift', 400));
    // }

    const existing = await Attendance.findOne({ user: user._id, shift, date });

    if (existing) {
      if (existing.checkOut) {
        return next(new ErrorResponse('You have already checked out for this shift', 400));
      }
      return next(new ErrorResponse('Already clocked in for this shift', 400));
    }


    const now = new Date();
    const status = now > startTime ? 'late' : 'present';

    const attendance = await Attendance.create({
      user: user._id,
      biometryId: user.biometryId,
      shift,
      checkIn: now,
      status,
      date,
      isCheckedIn: true,
      company: user.company,
      department: user.department,
    });
    
    
        const company = req.company;
   
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
          logoUrl: company?.branding?.logoUrl ,
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
  }
);


// 🔐 OFFICE BIOMETRY CHECK-OUT
export const biometryCheckOut = asyncHandler(async (req: TypedRequest<{}, {}, BiometryCheckInDto>, res: TypedResponse<BiometryCheckInResponse>, next: NextFunction) => {
  const { biometryId } = req.body;
  if (!biometryId) return next(new ErrorResponse('Missing biometryId', 400));

  const user = await User.findOne({ biometryId });
  if (!user || !user.isActive) return next(new ErrorResponse('Invalid or inactive user', 404));

  const { shift, endTime } = getCurrentShift();
  const date = new Date().toISOString().split('T')[0];

  const record = await Attendance.findOne({ user: user._id, shift, date });
  if (!record || record.checkOut)
    return next(new ErrorResponse('Not clocked in or already clocked out', 400));

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

  res.status(200).json({ success: true, data: {
    data: record
  } });
});

// 🔐 REMOTE MANUAL CHECK-OUT (AUTH REQUIRED)
// export const manualCheckOut = asyncHandler(async (
//     req: TypedRequest<{}, {}, ManualCheckInDto>,
//     res: TypedResponse<BiometryCheckInResponse>,
//     next: NextFunction
// ) => {
//   console.log("I AM HERE")
//   const user = await User.findById(req.user?.id);
//   if (!user || !user.isActive) return next(new ErrorResponse('Invalid or inactive user', 404));

//   const { shift: overrideShift } = req.body;
//   const { shift, endTime } = overrideShift ? getCurrentShift(overrideShift) : getCurrentShift();

//   const date = new Date().toISOString().split('T')[0];

//   const record = await Attendance.findOne({ user: user._id, shift, date });
//   if (!record || record.checkOut)
//     return next(new ErrorResponse('Not clocked in or already clocked out', 400));

//   const now = new Date();
//   const workedHours = +(Math.abs(now.getTime() - record.checkIn.getTime()) / 36e5).toFixed(2);

//   record.checkOut = now;
//   record.hoursWorked = workedHours;
//   record.isCheckedIn = false;

//   const isEarly = now < endTime;
//   if (isEarly) {
//     await sendNotification({
//       user,
//       type: 'WARNING',
//       title: 'Early Check-Out',
//       message: `You checked out early for your ${shift} shift on ${date}`,
//       metadata: { date, shift, checkOutTime: now.toTimeString().split(' ')[0] },
//       emailSubject: 'Early Check-Out Alert',
//       emailTemplate: 'early-checkout-notification.ejs',
//       emailData: {
//         name: user.firstName,
//         date,
//         shift,
//         checkOutTime: now.toTimeString().split(' ')[0],
//       },
//     });
//   }

//   await record.save();

//   res.status(200).json({ success: true, data: {
//     data: record
//   } });
// });
// 🔐 REMOTE MANUAL CHECK-OUT (AUTH REQUIRED)
// 🔐 REMOTE MANUAL CHECK-OUT (AUTH REQUIRED)




export const manualCheckOut = asyncHandler(async (
  req: TypedRequest<{}, {}, ManualCheckInDto>,
  res: TypedResponse<BiometryCheckInResponse>,
  next: NextFunction
) => {

  const user = await User.findById(req.user?.id);
  if (!user || !user.isActive)
    return next(new ErrorResponse('Invalid or inactive user', 404));

  const { shift: overrideShift } = req.body;

  const { shift, endTime } = overrideShift
    ? getCurrentShift(overrideShift)
    : getCurrentShift();


  const date = new Date().toISOString().split('T')[0];

  const record = await Attendance.findOne({ user: user._id, shift, date });
  if (!record || record.checkOut)
    return next(new ErrorResponse('Not clocked in or already clocked out', 400));

  const now = new Date();

  // Clamp clock-out time to shift end time if user clocks out late
  const effectiveClockOut = now > endTime ? endTime : now;

  // Calculate hours worked between check-in and effective clock-out
  const workedHours = +(
    (effectiveClockOut.getTime() - record.checkIn.getTime()) / 36e5
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
    }
  });
});




export const getMyAttendanceHistory = asyncHandler(async (
    req: TypedRequest,
    res: TypedResponse<AttendanceHistoryResponse>,
) => {
  const userId = req.user?.id;

  const history = await Attendance.find({ user: userId })
    .sort({ date: -1 })
    .select('-__v')
    .limit(50); // optional: limit for faster mobile UX

  res.status(200).json({
    success: true,
    data: {
      count: history.length,
      data: history
    },
  });
});


// export const adminAttendanceReport = asyncHandler(async (
//  req: TypedRequest<{}, AdminAttendanceReportQuery>,
//   res: TypedResponse<AttendanceHistoryResponse>,
//   next: NextFunction
// ) => {
//   const { startDate, endDate, department, shift, company } = req.query;

//   const query: any = {};

//   if (startDate && endDate) {
//     query.date = { $gte: startDate, $lte: endDate };
//   }

//   if (department) query.department = department;
//   if (shift) query.shift = shift;
//   if (company) query.company = company;

//   const attendanceRecords = await Attendance.find(query)
//     .populate('user', 'firstName lastName email role')
//     .sort({ date: -1 });

//   res.status(200).json({
//     success: true,
//     data: {
//       count: attendanceRecords.length,
//       data: attendanceRecords,
//     }
//   });
// });


export const adminAttendanceReport = asyncHandler(async (
  req: TypedRequest<{}, AdminAttendanceReportQuery>,
  res: TypedResponse<AttendanceHistoryResponse>
) => {
  const {
    startDate,
    endDate,
    department,
    shift,
    company,
    page = '1',
    limit = '20',
  } = req.query;

  const query: any = {};

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

  if (shift) query.shift = shift;

  if (company && isValidObjectId(company)) {
    query.company = company;
  }

  // Pagination
  const pageNum = Math.max(parseInt(page as string, 10), 1);
  const limitNum = Math.min(Math.max(parseInt(limit as string, 10), 1), 100); // cap at 100
  const skip = (pageNum - 1) * limitNum;

  // Query execution
  const [attendanceRecords, total] = await Promise.all([
    Attendance.find(query)
      .populate('user', 'firstName lastName email role')
      .sort({ date: -1 })
      .skip(skip)
      .limit(limitNum),
    Attendance.countDocuments(query),
  ]);

  // Respond
  res.status(200).json({
    success: true,
    data: {
      count: total,
      page: pageNum,
      pageSize: attendanceRecords.length,
      data: attendanceRecords,
    },
  });
});

export const getEmployeeAttendanceStats = asyncHandler(async (
  req: TypedRequest,
  res: TypedResponse<EmployeeAttendanceStatsResponse>
) => {
  const userId = req.user?.id;

  const totalDays = await Attendance.countDocuments({ user: userId });
  const lateDays = await Attendance.countDocuments({ user: userId, status: 'LATE' });
  const presentDays = await Attendance.countDocuments({ user: userId, status: 'PRESENT' });

  const hoursData = await Attendance.aggregate([
    { $match: { user: req.user?._id } },
    { $group: { _id: null, totalHours: { $sum: '$hoursWorked' } } },
  ]);

  res.status(200).json({
    success: true, 
    data:{
      data: {
        totalDays,
        lateDays,
        presentDays,
        totalHoursWorked: hoursData[0]?.totalHours || 0,
        latePercentage: totalDays ? Math.round((lateDays / totalDays) * 100) : 0,
      },
    }   
  });
});

// export const getCompanyAttendanceSummary = asyncHandler(async (
//   req: TypedRequest<{}, CompanyAttendanceSummaryQuery>,
//   res: TypedResponse<CompanyAttendanceSummaryResponse>
// ) => {
//   const { companyId } = req.query;
//   console.log("companyId", companyId)

//   const totalEmployees = await User.countDocuments({ company: companyId, role: 'Employee' });

//   const dayShift = await Attendance.countDocuments({ company: companyId, shift: 'day' });
//   const nightShift = await Attendance.countDocuments({ company: companyId, shift: 'night' });

//   const attendedToday = await Attendance.countDocuments({
//     company: companyId,
//     date: new Date().toISOString().split('T')[0],
//   });

//   const attendanceRate = totalEmployees
//     ? Math.round((attendedToday / totalEmployees) * 100)
//     : 0;

//   res.status(200).json({
//     success: true,
//     data: {
//       data:{

//         totalEmployees,
//         dayShift,
//         nightShift,
//         attendanceRate,
//       }
//     },
//   });
// });

export const getCompanyAttendanceSummary = asyncHandler(async (
  req: TypedRequest,
  res: TypedResponse<CompanyAttendanceSummaryResponse>
) => {
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
    role: 'Employee',
    isActive: true,
  });

  // Get attendance records for today and deduplicate by user
  const todayRecords = await Attendance.find({
    company: companyId,
    date: today,
  }).select('user shift');

  const uniqueUserIds = new Set(todayRecords.map((r) => r.user.toString()));
  const attendedToday = uniqueUserIds.size;

  // Separate shift counts for reporting (optional)
  const dayShift = todayRecords.filter(r => r.shift === 'day').length;
  const nightShift = todayRecords.filter(r => r.shift === 'night').length;

  const attendanceRate = totalEmployees
    ? Math.round((attendedToday / totalEmployees) * 100)
    : 0;

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
});


// export const getCompanyAttendanceSummary = asyncHandler(async (
//   req: TypedRequest,
//   res: TypedResponse<CompanyAttendanceSummaryResponse>
// ) => {
//   // Fetch the user making the request (HR or Admin)
//   const requester = await User.findById(req.user?.id);

//   if (!requester || !requester.company) {
//     return res.status(403).json({
//       success: false,
//       message: 'Unauthorized: User is not associated with any company.',
//     });
//   }

//   const companyId = requester.company;
//   console.log("companyId", companyId)
//   const today = new Date().toISOString().split('T')[0];

//   // Count all active employees in this company
//   const totalEmployees = await User.countDocuments({
//     company: companyId,
//     role: 'Employee',
//     isActive: true,
//   });

//   // Count attendance by shift for today
//   const [dayShift, nightShift] = await Promise.all([
//     Attendance.countDocuments({ company: companyId, shift: 'day', date: today }),
//     Attendance.countDocuments({ company: companyId, shift: 'night', date: today }),
//   ]);

//   const attendedToday = dayShift + nightShift;

//   const attendanceRate = totalEmployees
//     ? Math.round((attendedToday / totalEmployees) * 100)
//     : 0;

//   return res.status(200).json({
//     success: true,
//     data: {
//      data:{
//        totalEmployees, 
//       dayShift,
//       nightShift,
//       attendanceRate,
//      }
//     },
//   });
// });

export const markAbsentees = asyncHandler(async () => {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const date = yesterday.toISOString().split('T')[0];

  const employees = await User.find({ role: 'Employee', isActive: true });

  for (const user of employees) {
    const hasAttendance = await Attendance.findOne({ user: user._id, date });
    if (!hasAttendance) {
      await Attendance.create({
        user: user._id,
        biometryId: user.biometryId,
        shift: 'Day', // fallback
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
        metadata: { date, shift: 'Day' },
        emailSubject: 'You were marked absent',
        emailTemplate: 'absence-notification.ejs',
        emailData: { date, shift: 'Day',
          emailData: {
          date,
          shift: 'Day',
          companyName: (user.company as any)?.name,
          logoUrl: (user.company as any)?.branding?.logoUrl || '',
          primaryColor: (user.company as any)?.branding?.primaryColor || '#0621b6b0',
        },
         },
        });
  }



});


export const exportAttendanceExcel = asyncHandler(async (
  req: TypedRequest<{}, AttendanceFilterQuery>,
  res: Response,
) => {
  const { startDate, endDate, department, shift, company } = req.query;

  const query: any = {};

  if (startDate && endDate) query.date = { $gte: startDate, $lte: endDate };
  if (department) query.department = department;
  if (shift) query.shift = shift;
  if (company) query.company = company;

  const records = await Attendance.find(query)
    .populate('user', 'firstName lastName email role')
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
    { header: 'Biometry ID', key: 'biometryId', width: 20 },
  ];
  // Safely process records with populated user
  records.forEach((record) => {
    const user = record.user;

    if (
      user &&
      typeof user === 'object' &&
      'firstName' in user &&
      'lastName' in user &&
      'email' in user &&
      'role' in user
    ) {
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
        biometryId: record.biometryId,
      });
    }
  });


  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=attendance_${Date.now()}.xlsx`);

  await workbook.xlsx.write(res);
  res.end();
});



// Runs daily (you can schedule as you want)
export const autoCheckoutForgotten = async () => {
  const now = new Date();

  const activeRecords = await Attendance.find({
    isCheckedIn: true,
    checkOut: { $exists: false },
  }).populate<{"user": IUser}>('user').sort({ createdAt: -1 });

  for (const record of activeRecords) {
    // Parse record.date (string) into a Date for the base
    const baseDate = new Date(record.date);

    // Get shift timing based on shift + record date
    const { endTime } = getCurrentShift(record.shift, baseDate);


    // Auto check out only if the current time is past the shift's end
    if (now > endTime) {
      const workedHours = +(
        Math.abs(endTime.getTime() - new Date(record.checkIn).getTime()) / 36e5
      ).toFixed(2);

      record.checkOut = endTime;
      record.hoursWorked = workedHours;
      record.isCheckedIn = false;

      await record.save();

      // await sendNotification({
      //   user: record.user,
      //   type: 'WARNING',
      //   title: 'Auto Check-Out',
      //   message: `You were automatically checked out for your ${record.shift} shift on ${record.date} at ${endTime.toTimeString().split(' ')[0]}.`,
      //   emailSubject: 'Automatic Check-Out Notification',
      //   emailTemplate: 'auto-checkout-notification.ejs',
      //   emailData: {
      //     name: (record.user as any).firstName,
      //     date: record.date,
      //     shift: record.shift,
      //     checkOutTime: endTime.toTimeString().split(' ')[0],
      //     hoursWorked,
      //   },
      // });

    }
  }
};
