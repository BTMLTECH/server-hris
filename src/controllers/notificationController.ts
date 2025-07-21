import { Request, Response, NextFunction } from 'express';
import Notification from '../models/Notification';
import ErrorResponse from '../utils/ErrorResponse';
import { asyncHandler } from '../middleware/asyncHandler';

// 🔹 Get all notifications for logged-in user
export const getMyNotifications = asyncHandler(async (req: any, res: Response) => {
  const notifications = await Notification.find({ user: req.user.id }).sort({ createdAt: -1 });
  res.status(200).json({ success: true, count: notifications.length, data: notifications });
});

// 🔹 Mark notification as read
export const markAsRead = asyncHandler(async (req: any, res: Response, next: NextFunction) => {
  const notif = await Notification.findOne({ _id: req.params.id, user: req.user.id });
  if (!notif) return next(new ErrorResponse('Notification not found', 404));

  notif.read = true;
  await notif.save();
  res.status(200).json({ success: true, data: notif });
});

// 🔹 Delete notification
export const deleteNotification = asyncHandler(async (req: any, res: Response, next: NextFunction) => {
  const notif = await Notification.findOneAndDelete({ _id: req.params.id, user: req.user.id });
  if (!notif) return next(new ErrorResponse('Notification not found', 404));

  res.status(200).json({ success: true, message: 'Notification deleted' });
});

// 🔹 Mark all as read
export const markAllAsRead = asyncHandler(async (req: any, res: Response) => {
  await Notification.updateMany({ user: req.user.id, read: false }, { read: true });
  res.status(200).json({ success: true, message: 'All notifications marked as read' });
});
