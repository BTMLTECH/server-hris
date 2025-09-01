import { Router } from 'express';
import { allowAdminAndHR, allowAdminOnly, allowAllRoles, protect } from '../middleware/auth.middleware';
import { tenantAuth } from '../middleware/tenantAuth';

import { ReportController } from '../controllers/report.controller';

const router = Router();

const reportController = new ReportController();

// Routes
router.post(
  '/get-employee-summary',
  protect,
  tenantAuth,
  allowAdminAndHR,
  reportController.generateEmploymentSummary.bind(reportController) 
);



export default router;
