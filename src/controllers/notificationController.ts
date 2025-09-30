import { NextFunction } from 'express';
import Notification, { INotification } from '../models/Notification';
import ErrorResponse from '../utils/ErrorResponse';
import { asyncHandler } from '../middleware/asyncHandler';
import { TypedRequest } from '../types/typedRequest';
import { TypedResponse } from '../types/typedResponse';

interface GetNotificationsQuery {
  page?: string;
  limit?: string;
  read?: 'true' | 'false';
}

export interface NotificationResponse {
  success: boolean;
  count: number;
  total: number;
  unreadCount: number;
  currentPage: number;
  totalPages: number;
  data: INotification[];
}

export const getNotifications = asyncHandler(
  async (req: TypedRequest<{}, GetNotificationsQuery, {}>, res: any, _next: NextFunction) => {
    const page = parseInt(req.query.page ?? '1');
    const limit = parseInt(req.query.limit ?? '20');
    const skip = (page - 1) * limit;

    const companyId = req.company?._id;

    if (!companyId) {
      return res.status(404).json({
        success: false,
        count: 0,
        total: 0,
        unreadCount: 0,
        currentPage: page,
        totalPages: 0,
        data: [],
      });
    }

    const filter: any = { company: companyId };

    if (req.user?.role !== 'hr' && req.user?.role !== 'admin') {
      filter.user = req.user?._id;
    }

    if (req.query.read === 'true') {
      filter.read = true;
    } else if (req.query.read === 'false') {
      filter.read = false;
    }

    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find(filter)
        .populate('user', 'firstName lastName email role')
        .sort({ read: 1, createdAt: -1 }) // unread first, newest first
        .skip(skip)
        .limit(limit),
      Notification.countDocuments(filter),
      Notification.countDocuments({ ...filter, read: false }),
    ]);

    const response: NotificationResponse = {
      success: true,
      count: notifications.length,
      total,
      unreadCount,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      data: notifications,
    };

    res.status(200).json(response);
  },
);

// 🔹 Mark a single notification as read
export const markAsRead = asyncHandler(
  async (req: TypedRequest<{ id?: string }, {}, {}>, res: any, next: NextFunction) => {
    const companyId = req.company?._id;
    const notif = await Notification.findOne({
      _id: req.params.id,
      user: req.user?._id,
      company: companyId,
    });

    if (!notif) {
      return next(new ErrorResponse('Notification not found', 404));
    }

    notif.read = true;
    await notif.save();

    res.status(200).json({ success: true, data: notif });
  },
);

// 🔹 Mark all notifications as read
export const markAllAsRead = asyncHandler(
  async (
    req: TypedRequest<{}, {}, {}>,
    res: TypedResponse<{ message: string }>,
    _next: NextFunction,
  ) => {
    const companyId = req.company?._id;

    const filter: any = { read: false, company: companyId };

    // HR/Admin can mark all, others only their own
    if (req.user?.role !== 'hr' && req.user?.role !== 'admin') {
      filter.user = req.user?._id;
    }

    await Notification.updateMany(filter, { read: true });

    res.status(200).json({ success: true, message: 'All notifications marked as read' });
  },
);

// 🔹 Delete a notification
export const deleteNotification = asyncHandler(
  async (
    req: TypedRequest<{ id?: string }, {}, {}>,
    res: TypedResponse<{ message: string }>,
    next: NextFunction,
  ) => {
    const companyId = req.company?._id;

    const filter: any = { _id: req.params.id, company: companyId };

    if (req.user?.role !== 'hr' && req.user?.role !== 'admin') {
      filter.user = req.user?._id;
    }

    const notif = await Notification.findOneAndDelete(filter);

    if (!notif) {
      return next(new ErrorResponse('Notification not found', 404));
    }

    res.status(200).json({ success: true, message: 'Notification deleted' });
  },
);
