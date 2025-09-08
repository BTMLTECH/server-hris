import express from "express";
import {
  createHandoverReport,
  getMyHandovers,
  getTeamLeadByEmployeeDepartment,
  deleteHandoverById,
} from "../controllers/handoverController";
import { protect, allowEmployeesOnly, allowAllRoles } from "../middleware/auth.middleware";
import { tenantAuth } from "../middleware/tenantAuth";
import uploadHandover from "../middleware/uploadHandover";

const router = express.Router();

// Create a handover report
router.post(
  "/create",
  protect,
  tenantAuth,
  allowEmployeesOnly,
  uploadHandover.single("file"),
  createHandoverReport
);

// Get my reports
router.get("/report", protect, tenantAuth, allowEmployeesOnly, getMyHandovers);

// Get team lead reports by department
router.get("/reports", protect, tenantAuth, allowAllRoles, getTeamLeadByEmployeeDepartment);

// Delete a report
router.delete("/report/:id", protect, tenantAuth, allowEmployeesOnly, deleteHandoverById);

export default router;
