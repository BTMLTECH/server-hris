import express from 'express';
import { adminAttendanceReport, biometryCheckIn, biometryCheckOut, exportAttendanceExcel, getCompanyAttendanceSummary, getEmployeeAttendanceStats, getMyAttendanceHistory, manualCheckIn, manualCheckOut } from '../controllers/attendanceController';
import { allowAdminAndHR, allowAdminOnly, allowEmployeesOnly, allowEveryone, authorizeRoles, protect } from '../middleware/auth.middleware';
import { checkBiometryApiKey } from '../middleware/checkBiometryApiKey';
import { tenantAuth } from '../middleware/tenantAuth';
import { getMyNotifications, markAsRead, markAllAsRead, deleteNotification } from '../controllers/notificationController';


const router = express.Router();

router.use(protect, tenantAuth);

router.get('/', getMyNotifications);
router.patch('/:id/read', markAsRead);
router.patch('/mark-all', markAllAsRead);
router.delete('/:id', deleteNotification);

export default router;
