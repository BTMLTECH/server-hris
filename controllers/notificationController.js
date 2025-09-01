"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteNotification = exports.markAllAsRead = exports.markAsRead = exports.getNotifications = void 0;
const Notification_1 = __importDefault(require("../models/Notification"));
const ErrorResponse_1 = __importDefault(require("../utils/ErrorResponse"));
const asyncHandler_1 = require("../middleware/asyncHandler");
exports.getNotifications = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const page = parseInt(req.query.page) || 1; // default page
    const limit = parseInt(req.query.limit) || 20; // default per page
    const skip = (page - 1) * limit;
    // If read=true, return empty notifications with success response
    if (req.query.read === 'true') {
        return res.status(200).json({
            success: true,
            count: 0,
            total: 0,
            unreadCount: 0,
            currentPage: page,
            totalPages: 0,
            data: []
        });
    }
    // Role-based filter
    let filter = {};
    if (req.user.role !== 'hr' && req.user.role !== 'admin') {
        filter.user = req.user._id;
    }
    // If read filter is provided and it's false, add it to filter
    if (req.query.read === 'false') {
        filter.read = false;
    }
    const [notifications, total, unreadCount] = await Promise.all([
        Notification_1.default.find(filter)
            .populate('user', 'firstName lastName email role')
            .sort({ read: 1, createdAt: -1 }) // unread first, newest first
            .skip(skip)
            .limit(limit),
        Notification_1.default.countDocuments(filter),
        Notification_1.default.countDocuments({ ...filter, read: false })
    ]);
    res.status(200).json({
        success: true,
        count: notifications.length,
        total,
        unreadCount,
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        data: notifications
    });
});
/**
 * 🔹 Mark a single notification as read
 */
exports.markAsRead = (0, asyncHandler_1.asyncHandler)(async (req, res, next) => {
    const notif = await Notification_1.default.findOne({ _id: req.params.id, user: req.user._id });
    if (!notif)
        return next(new ErrorResponse_1.default('Notification not found', 404));
    notif.read = true;
    await notif.save();
    res.status(200).json({ success: true, data: notif });
});
/**
 * 🔹 Mark all notifications as read
 * HR/Admin → mark all
 * Others → mark only their own
 */
exports.markAllAsRead = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    let filter = { read: false };
    if (req.user.role !== 'hr' && req.user.role !== 'admin') {
        filter.user = req.user._id;
    }
    await Notification_1.default.updateMany(filter, { read: true });
    res.status(200).json({ success: true, message: 'All notifications marked as read' });
});
/**
 * 🔹 Delete a single notification
 * HR/Admin → delete any
 * Others → delete only their own
 */
exports.deleteNotification = (0, asyncHandler_1.asyncHandler)(async (req, res, next) => {
    let filter = { _id: req.params.id };
    if (req.user.role !== 'hr' && req.user.role !== 'admin') {
        filter.user = req.user._id;
    }
    const notif = await Notification_1.default.findOneAndDelete(filter);
    if (!notif)
        return next(new ErrorResponse_1.default('Notification not found', 404));
    res.status(200).json({ success: true, message: 'Notification deleted' });
});
