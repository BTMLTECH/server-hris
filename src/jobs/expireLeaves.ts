"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.expireUnreviewedLeaves = void 0;
const LeaveRequest_1 = __importDefault(require("../models/LeaveRequest"));
const sendNotification_1 = require("../utils/sendNotification");
const logAudit_1 = require("../utils/logAudit");
const expireUnreviewedLeaves = async () => {
    const now = new Date();
    // Find all pending leaves where endDate has passed
    const expiredLeaves = await LeaveRequest_1.default.find({
        status: 'Pending',
        endDate: { $lt: now },
    }).populate('user', 'firstName lastName email');
    if (!expiredLeaves.length)
        return;
    // Bulk update all expired leaves
    const bulkOps = expiredLeaves.map((leave) => ({
        updateOne: {
            filter: { _id: leave._id },
            update: { $set: { status: 'Expired' } },
        },
    }));
    await LeaveRequest_1.default.bulkWrite(bulkOps);
    // Send notifications in parallel
    await Promise.all(expiredLeaves.map(async (leave) => {
        const employee = leave.user;
        await (0, sendNotification_1.sendNotification)({
            user: employee,
            type: 'WARNING',
            title: 'Leave Request Expired ⚠️',
            message: `Your ${leave.type} leave request from ${leave.startDate.toDateString()} to ${leave.endDate.toDateString()} has expired without review.`,
            emailSubject: 'Leave Request Expired',
            emailTemplate: 'leave-expired.ejs',
            emailData: {
                name: employee.firstName,
                type: leave.type,
                startDate: leave.startDate,
                endDate: leave.endDate,
                days: leave.days,
            },
        });
        await (0, logAudit_1.logAudit)({
            userId: employee._id,
            action: 'LEAVE_EXPIRED',
            status: 'SYSTEM',
            details: `Leave expired automatically (ID: ${leave._id})`,
        });
    }));
};
exports.expireUnreviewedLeaves = expireUnreviewedLeaves;
