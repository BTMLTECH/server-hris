import express from "express";
import {
  createLeaveRequest,
  approveLeaveRequest,
  rejectLeaveRequest,
  getLeaveApprovalQueue,
  getLeaveActivityFeed,
  getLeaveApprovers,
  getLeaveStatusOverview,
  deleteLeave,
} from "../controllers/leaveController";
import { protect, allowEveryone, allowAllRoles, allowAdminAndHR, allowEmployeesOnly } from "../middleware/auth.middleware";
import { tenantAuth } from "../middleware/tenantAuth";
import uploadHandover from "../middleware/uploadHandover";
import { updateLeaveBalance } from "../controllers/leaveBalanceController";

const router = express.Router();

// Leave request routes
router.post("/request", protect, tenantAuth, allowEveryone, uploadHandover.single("file"), createLeaveRequest);
router.post("/:id/approve", protect, tenantAuth, allowAllRoles, approveLeaveRequest);
router.post("/:id/reject", protect, tenantAuth, allowAllRoles, rejectLeaveRequest);

// Leave queue & activity
router.get("/leave-queue", protect, tenantAuth, allowEveryone, getLeaveApprovalQueue);
router.get("/activity-feed", protect, tenantAuth, allowEveryone, getLeaveActivityFeed);
router.get("/teamlead", protect, tenantAuth, allowEveryone, getLeaveApprovers);
router.get("/status-overview", protect, tenantAuth, allowEveryone, getLeaveStatusOverview);
router.put("/:id/balance", protect, tenantAuth, allowAdminAndHR, updateLeaveBalance);
router.delete("/:id/delete", protect, tenantAuth, allowEmployeesOnly, deleteLeave);

export default router;
