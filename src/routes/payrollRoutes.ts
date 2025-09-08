import { Router } from "express";
import {
  getAllPayrolls,
  markPayrollAsPaid,
  markPayrollAsDraft,
  processSinglePayroll,
  reverseSinglePayroll,
  processBulkPayroll,
  reverseBulkPayroll,
  markPayrollsAsDraftBulk,
  markPayrollsAsPaidBulk,
  deletePayroll,
} from "../controllers/payrollController";
import { protect, allowAllRoles, allowAdminAndHR } from "../middleware/auth.middleware";
import { tenantAuth } from "../middleware/tenantAuth";

const router = Router();

// GET all payrolls/payslips
router.get("/get-payslips", protect, tenantAuth, allowAllRoles, getAllPayrolls);

// Single payroll operations
router.patch("/:payrollId/paid", protect, tenantAuth, allowAdminAndHR, markPayrollAsPaid);
router.patch("/:payrollId/draft", protect, tenantAuth, allowAdminAndHR, markPayrollAsDraft);
router.patch("/:payrollId/process", protect, tenantAuth, allowAdminAndHR, processSinglePayroll);
router.patch("/:payrollId/reverse", protect, tenantAuth, allowAdminAndHR, reverseSinglePayroll);

// Bulk payroll operations
router.post("/process-bulk", protect, tenantAuth, allowAdminAndHR, processBulkPayroll);
router.post("/reverse-bulk", protect, tenantAuth, allowAdminAndHR, reverseBulkPayroll);
router.post("/bulk-draft", protect, tenantAuth, allowAdminAndHR, markPayrollsAsDraftBulk);
router.post("/bulk-pay", protect, tenantAuth, allowAdminAndHR, markPayrollsAsPaidBulk);

// Delete payroll
router.delete("/:id", protect, tenantAuth, allowAdminAndHR, deletePayroll);

export default router;
