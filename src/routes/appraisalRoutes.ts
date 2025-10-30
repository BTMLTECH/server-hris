import express from "express";
import {
  createAppraisalRequest,
  updateAppraisalRequest,
  approveAppraisalRequest,
  rejectAppraisalRequest,
  getAppraisalApprovalQueue,
  getAppraisalActivity,
  // getEmployeesByTeamLeadDepartment,
} from "../controllers/AppraisalController";
import {
  protect,
  allowEveryone,
  // allowTeamLead,
  allowTeamLeadHRManager,
} from "../middleware/auth.middleware";
import { tenantAuth } from "../middleware/tenantAuth";

const router = express.Router();

// Create and update appraisal requests
router.post("/request", protect, tenantAuth, allowEveryone, createAppraisalRequest);
router.patch("/update/:id", protect, tenantAuth, allowEveryone, updateAppraisalRequest);

// Approve / reject appraisal requests
router.post("/:id/approve", protect, tenantAuth, allowTeamLeadHRManager, approveAppraisalRequest);
router.post("/:id/reject", protect, tenantAuth, allowTeamLeadHRManager, rejectAppraisalRequest);

// Queues and activity
router.get("/appraisal-queue", protect, tenantAuth, allowEveryone, getAppraisalApprovalQueue);
router.get("/activity", protect, tenantAuth, allowEveryone, getAppraisalActivity);

// Employees under team lead
// router.get("/get-employee", protect, tenantAuth, allowTeamLead, getEmployeesByTeamLeadDepartment);

export default router;
