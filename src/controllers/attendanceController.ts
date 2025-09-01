"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.autoCheckoutForgotten = exports.exportAttendanceExcel = exports.markAbsentees = exports.getCompanyAttendanceSummary = exports.getEmployeeAttendanceStats = exports.adminAttendanceReport = exports.getAttendanceHistory = exports.manualCheckOut = exports.biometryCheckOut = exports.manualCheckIn = exports.biometryCheckIn = void 0;
const exceljs_1 = __importDefault(require("exceljs"));
const Attendance_1 = __importDefault(require("../models/Attendance"));
const user_model_1 = __importDefault(require("../models/user.model"));
const ErrorResponse_1 = __importDefault(require("../utils/ErrorResponse"));
const sendNotification_1 = require("../utils/sendNotification");
const shiftUtils_1 = require("../utils/shiftUtils");
const mongoose_1 = require("mongoose");
const asyncHandler_1 = require("../middleware/asyncHandler");
// 🔐 OFFICE BIOMETRY CHECK-IN
exports.biometryCheckIn = (0, asyncHandler_1.asyncHandler)(async (req, res, next) => {
    const { biometryId } = req.body;
    if (!biometryId)
        return next(new ErrorResponse_1.default('Missing biometryId', 400));
    const user = await user_model_1.default.findOne({ biometryId });
    if (!user || !user.isActive)
        return next(new ErrorResponse_1.default('Invalid or inactive user', 404));
    const { shift, startTime } = (0, shiftUtils_1.getCurrentShift)();
    const date = new Date().toISOString().split('T')[0];
    const existing = await Attendance_1.default.findOne({ user: user._id, shift, date });
    if (existing)
        return next(new ErrorResponse_1.default('Already clocked in for this shift', 400));
    const now = new Date();
    const status = now > startTime ? 'late' : 'present';
    const attendance = await Attendance_1.default.create({
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
        await (0, sendNotification_1.sendNotification)({
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
exports.manualCheckIn = (0, asyncHandler_1.asyncHandler)(async (req, res, next) => {
    const user = await user_model_1.default.findById(req.user?.id);
    if (!user || !user.isActive) {
        return next(new ErrorResponse_1.default('Invalid or inactive user', 404));
    }
    const { shift: overrideShift } = req.body;
    const { shift, startTime } = overrideShift
        ? (0, shiftUtils_1.getCurrentShift)(overrideShift)
        : (0, shiftUtils_1.getCurrentShift)();
    const date = new Date().toISOString().split('T')[0];
    // const existing = await Attendance.findOne({ user: user._id, shift, date });
    // if (existing) {
    //   return next(new ErrorResponse('Already clocked in for this shift', 400));
    // }
    const existing = await Attendance_1.default.findOne({ user: user._id, shift, date });
    if (existing) {
        if (existing.checkOut) {
            return next(new ErrorResponse_1.default('You have already checked out for this shift', 400));
        }
        return next(new ErrorResponse_1.default('Already clocked in for this shift', 400));
    }
    const now = new Date();
    const status = now > startTime ? 'late' : 'present';
    const attendance = await Attendance_1.default.create({
        user: user._id,
        // biometryId: user.biometryId,
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
        await (0, sendNotification_1.sendNotification)({
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
});
// 🔐 OFFICE BIOMETRY CHECK-OUT
exports.biometryCheckOut = (0, asyncHandler_1.asyncHandler)(async (req, res, next) => {
    const { biometryId } = req.body;
    if (!biometryId)
        return next(new ErrorResponse_1.default('Missing biometryId', 400));
    const user = await user_model_1.default.findOne({ biometryId });
    if (!user || !user.isActive)
        return next(new ErrorResponse_1.default('Invalid or inactive user', 404));
    const { shift, endTime } = (0, shiftUtils_1.getCurrentShift)();
    const date = new Date().toISOString().split('T')[0];
    const record = await Attendance_1.default.findOne({ user: user._id, shift, date });
    if (!record || record.checkOut)
        return next(new ErrorResponse_1.default('Not clocked in or already clocked out', 400));
    const now = new Date();
    const workedHours = +(Math.abs(now.getTime() - record.checkIn.getTime()) / 36e5).toFixed(2);
    record.checkOut = now;
    record.hoursWorked = workedHours;
    record.isCheckedIn = false;
    const isEarly = now < endTime;
    if (isEarly) {
        await (0, sendNotification_1.sendNotification)({
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
exports.manualCheckOut = (0, asyncHandler_1.asyncHandler)(async (req, res, next) => {
    const user = await user_model_1.default.findById(req.user?.id);
    if (!user || !user.isActive)
        return next(new ErrorResponse_1.default('Invalid or inactive user', 404));
    const { shift: overrideShift } = req.body;
    const { shift, endTime } = overrideShift
        ? (0, shiftUtils_1.getCurrentShift)(overrideShift)
        : (0, shiftUtils_1.getCurrentShift)();
    const date = new Date().toISOString().split('T')[0];
    const record = await Attendance_1.default.findOne({ user: user._id, shift, date });
    if (!record || record.checkOut)
        return next(new ErrorResponse_1.default('Not clocked in or already clocked out', 400));
    const now = new Date();
    // Clamp clock-out time to shift end time if user clocks out late
    const effectiveClockOut = now > endTime ? endTime : now;
    // Calculate hours worked between check-in and effective clock-out
    const workedHours = +((effectiveClockOut.getTime() - record.checkIn.getTime()) / 36e5).toFixed(2);
    // Update record
    record.checkOut = now;
    record.hoursWorked = workedHours;
    record.isCheckedIn = false;
    // Early checkout detection
    const isEarly = now < endTime;
    if (isEarly) {
        await (0, sendNotification_1.sendNotification)({
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
// export const getMyAttendanceHistory = asyncHandler(async (
//     req: TypedRequest,
//     res: TypedResponse<AttendanceHistoryResponse>,
// ) => {
//   const userId = req.user?.id;
//   const history = await Attendance.find({ user: userId })
//     .sort({ date: -1 })
//     .select('-__v')
//     .limit(50); // optional: limit for faster mobile UX
//   res.status(200).json({
//     success: true,
//     data: {
//       count: history.length,
//       data: history
//     },
//   });
// });
exports.getAttendanceHistory = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const user = req.user;
    if (!user) {
        return res.status(401).json({
            success: false,
            message: 'Unauthorized',
            data: {
                data: [],
                pagination: { total: 0, page: 1, limit: 10, pages: 1 },
                count: 0,
            },
        });
    }
    const { startDate, endDate, department, shift, company, page = 1, limit = 20, } = req.query;
    const query = {};
    const isRestricted = ['employee', 'teamlead', 'md'].includes(user.role);
    if (isRestricted) {
        query.user = user.id;
    }
    else {
        if (department && (0, mongoose_1.isValidObjectId)(department))
            query.department = department;
        if (shift)
            query.shift = shift;
        if (company && (0, mongoose_1.isValidObjectId)(company))
            query.company = company;
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
        Attendance_1.default.find(query)
            .populate('user', 'firstName lastName email role')
            .sort({ date: -1 })
            .skip(skip)
            .limit(limitNum),
        Attendance_1.default.countDocuments(query),
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
            count: 0, // optional: could be used for filtered/specific criteria count
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
exports.adminAttendanceReport = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { startDate, endDate, department, shift, company, page = '1', limit = '20', } = req.query;
    const query = {};
    // Date filter
    if (startDate && endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);
        if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
            query.date = { $gte: start, $lte: end };
        }
    }
    // Optional filters
    if (department && (0, mongoose_1.isValidObjectId)(department)) {
        query.department = department;
    }
    if (shift)
        query.shift = shift;
    if (company && (0, mongoose_1.isValidObjectId)(company)) {
        query.company = company;
    }
    // Pagination
    const pageNum = Math.max(parseInt(page, 10), 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10), 1), 100);
    const skip = (pageNum - 1) * limitNum;
    const [attendanceRecords, total] = await Promise.all([
        Attendance_1.default.find(query)
            .populate('user', 'firstName lastName email role')
            .sort({ date: -1 })
            .skip(skip)
            .limit(limitNum),
        Attendance_1.default.countDocuments(query),
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
exports.getEmployeeAttendanceStats = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const userId = req.user?.id;
    const totalDays = await Attendance_1.default.countDocuments({ user: userId });
    const lateDays = await Attendance_1.default.countDocuments({ user: userId, status: 'LATE' });
    const presentDays = await Attendance_1.default.countDocuments({ user: userId, status: 'PRESENT' });
    const hoursData = await Attendance_1.default.aggregate([
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
        }
    });
});
exports.getCompanyAttendanceSummary = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const requester = await user_model_1.default.findById(req.user?.id);
    if (!requester || !requester.company) {
        return res.status(403).json({
            success: false,
            message: 'Unauthorized: User is not associated with any company.',
        });
    }
    const companyId = requester.company;
    const today = new Date().toISOString().split('T')[0];
    const totalEmployees = await user_model_1.default.countDocuments({
        company: companyId,
        role: 'Employee',
        isActive: true,
    });
    // Get attendance records for today and deduplicate by user
    const todayRecords = await Attendance_1.default.find({
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
exports.markAbsentees = (0, asyncHandler_1.asyncHandler)(async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const date = yesterday.toISOString().split('T')[0];
    const employees = await user_model_1.default.find({ role: 'Employee', isActive: true });
    for (const user of employees) {
        const hasAttendance = await Attendance_1.default.findOne({ user: user._id, date });
        if (!hasAttendance) {
            await Attendance_1.default.create({
                user: user._id,
                // biometryId: user.biometryId,
                shift: 'Day', // fallback
                status: 'absent',
                checkIn: undefined,
                date,
                company: user.company,
                department: user.department,
            });
        }
        await (0, sendNotification_1.sendNotification)({
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
                    companyName: user.company?.name,
                    logoUrl: user.company?.branding?.logoUrl || '',
                    primaryColor: user.company?.branding?.primaryColor || '#0621b6b0',
                },
            },
        });
    }
});
exports.exportAttendanceExcel = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { startDate, endDate, department, shift, company } = req.query;
    const query = {};
    if (startDate && endDate)
        query.date = { $gte: startDate, $lte: endDate };
    if (department)
        query.department = department;
    if (shift)
        query.shift = shift;
    if (company)
        query.company = company;
    const records = await Attendance_1.default.find(query)
        .populate('user', 'firstName lastName email role')
        .sort({ date: 1 });
    // Create workbook and worksheet
    const workbook = new exceljs_1.default.Workbook();
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
        // { header: 'Biometry ID', key: 'biometryId', width: 20 },
    ];
    // Safely process records with populated user
    records.forEach((record) => {
        const user = record.user;
        if (user &&
            typeof user === 'object' &&
            'firstName' in user &&
            'lastName' in user &&
            'email' in user &&
            'role' in user) {
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
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=attendance_${Date.now()}.xlsx`);
    await workbook.xlsx.write(res);
    res.end();
});
// Runs daily (you can schedule as you want)
const autoCheckoutForgotten = async () => {
    const now = new Date();
    const activeRecords = await Attendance_1.default.find({
        isCheckedIn: true,
        checkOut: { $exists: false },
    }).populate('user').sort({ createdAt: -1 });
    for (const record of activeRecords) {
        // Parse record.date (string) into a Date for the base
        const baseDate = new Date(record.date);
        // Get shift timing based on shift + record date
        const { endTime } = (0, shiftUtils_1.getCurrentShift)(record.shift, baseDate);
        // Auto check out only if the current time is past the shift's end
        if (now > endTime) {
            const workedHours = +(Math.abs(endTime.getTime() - new Date(record.checkIn).getTime()) / 36e5).toFixed(2);
            record.checkOut = endTime;
            record.hoursWorked = workedHours;
            record.isCheckedIn = false;
            await record.save();
        }
    }
};
exports.autoCheckoutForgotten = autoCheckoutForgotten;
