import express from 'express';
import { adminAttendanceReport, biometryCheckIn, biometryCheckOut, exportAttendanceExcel, getCompanyAttendanceSummary, getEmployeeAttendanceStats, getMyAttendanceHistory, manualCheckIn, manualCheckOut } from '../controllers/attendanceController';
import { allowAdminAndHR, allowAdminOnly, allowAllRoles, allowEmployeesOnly, allowEveryone, authorizeRoles, protect } from '../middleware/auth.middleware';
import { checkBiometryApiKey } from '../middleware/checkBiometryApiKey';
import { tenantAuth } from '../middleware/tenantAuth';


const router = express.Router();

router.post('/biometry-check-in', checkBiometryApiKey, biometryCheckIn);
router.post('/biometry-check-out', checkBiometryApiKey, biometryCheckOut);
router.post('/check-in', protect, tenantAuth, allowEveryone, manualCheckIn);
router.post('/check-out', protect, tenantAuth, allowEveryone, manualCheckOut);


router.get(
  '/my-history',
  protect,
  tenantAuth,
  allowAllRoles,
  getMyAttendanceHistory
);

router.get(
  '/admin/report',
  protect,
  tenantAuth,
  allowAdminAndHR,
  adminAttendanceReport
);

router.get(
  '/my-stats',
  protect,
  tenantAuth,
  allowEmployeesOnly,
  getEmployeeAttendanceStats
);

router.get(
  '/company-summary',
  protect,
  tenantAuth,
  allowAllRoles,
  getCompanyAttendanceSummary
);

router.get(
  '/admin/export-excel',
  protect,
  tenantAuth,
 allowAdminAndHR,
  exportAttendanceExcel
);

export default router;
