import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { allowAdminOnly, allowAllRoles, protect } from '../middleware/auth.middleware';
import { tenantAuth } from '../middleware/tenantAuth';
import uploadHandover from '../middleware/uploadHandover';
import { bulkUploadPayroll, createPayroll, getMyPayslips, getPayrollOverview } from '../controllers/payrollController';

const router = Router();



// Routes
router.post(
  '/bulk-import',
  protect,
  tenantAuth,
  allowAdminOnly,
 createPayroll
);

router.post(
  '/bulk-payroll',
  protect,
  tenantAuth,
  allowAdminOnly,
  bulkUploadPayroll
);

router.get(
  '/get-payslips',
  protect,
  tenantAuth,
  allowAllRoles,
  getMyPayslips
);

router.get(
  '/overview',
  protect,
  tenantAuth,
  allowAllRoles,
  getPayrollOverview
);

export default router;
