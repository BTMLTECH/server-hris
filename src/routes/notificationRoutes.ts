import express from 'express';
import {
  protect,
  allowAllRoles,
  allowEmployeesOnly,
  allowAdminAndHR,
} from '../middleware/auth.middleware';
import { tenantAuth } from '../middleware/tenantAuth';
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
} from '../controllers/notificationController';

const router = express.Router();

// Apply auth & tenant middleware to all routes
router.use(protect, tenantAuth);

// GET /notifications
router.get('/', protect, tenantAuth, allowAllRoles, getNotifications);

// PATCH /notifications/:id/read
router.patch('/:id/read', protect, tenantAuth, allowEmployeesOnly, markAsRead);

// PATCH /notifications/read-all
router.patch('/read-all', protect, tenantAuth, allowAdminAndHR, markAllAsRead);

// DELETE /notifications/:id
router.delete('/:id', protect, tenantAuth, allowAdminAndHR, deleteNotification);

export default router;
