import express from "express";
import {
  biometryCheckIn,
  biometryCheckOut,
  manualCheckIn,
  manualCheckOut,
  getAttendanceHistory,
  adminAttendanceReport,
  getEmployeeAttendanceStats,
  getCompanyAttendanceSummary,
  exportAttendanceExcel,
} from "../controllers/attendanceController";
import { protect, allowEveryone, allowAllRoles, allowAdminAndHR, allowEmployeesOnly } from "../middleware/auth.middleware";
import { tenantAuth } from "../middleware/tenantAuth";
import { checkBiometryApiKey } from "../middleware/checkBiometryApiKey";

const router = express.Router();

// Biometry check-in/out
router.post("/biometry-check-in", checkBiometryApiKey, biometryCheckIn);
router.post("/biometry-check-out", checkBiometryApiKey, biometryCheckOut);

// Manual check-in/out
router.post("/check-in", protect, tenantAuth, allowEveryone, manualCheckIn);
router.post("/check-out", protect, tenantAuth, allowEveryone, manualCheckOut);

// Attendance history & stats
router.get("/my-history", protect, tenantAuth, allowAllRoles, getAttendanceHistory);
router.get("/my-stats", protect, tenantAuth, allowEmployeesOnly, getEmployeeAttendanceStats);

// Admin & company reports
router.get("/admin/report", protect, tenantAuth, allowAdminAndHR, adminAttendanceReport);
router.get("/company-summary", protect, tenantAuth, allowAllRoles, getCompanyAttendanceSummary);
router.get("/admin/export-excel", protect, tenantAuth, allowAdminAndHR, exportAttendanceExcel);

export default router;
