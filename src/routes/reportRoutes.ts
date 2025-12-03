import { Router } from 'express';
import { protect, allowAdminAndHR } from '../middleware/auth.middleware';
import { tenantAuth } from '../middleware/tenantAuth';
import { ReportController } from '../controllers/report.controller';
import { createComms, getAllComms } from '../controllers/commsController';
import { createITReport, createReportLink, getAllITReports } from '../controllers/ITReportController';
import { createOperation, getAllOperations } from '../controllers/operationController';
import {
  createQualityAssurance,
  getAllQualityAssurance,
} from '../controllers/qualityAssuranceController';

const router = Router();
const reportController = new ReportController();

// Routes
router.post(
  '/get-employee-summary',
  protect,
  tenantAuth,
  allowAdminAndHR,
  reportController.generateEmploymentSummary.bind(reportController),
);

router.post('/create-quality', createQualityAssurance);
router.post('/create-operation', createOperation);
router.post('/create-comms', createComms);
router.post('/create-itreport', createITReport);

router.post('/create-link',protect, tenantAuth, allowAdminAndHR, createReportLink);

router.get('/get-quality',protect, tenantAuth, allowAdminAndHR, getAllQualityAssurance);
router.get('/get-operations',protect, tenantAuth, allowAdminAndHR, getAllOperations);
router.get('/get-comms',protect, tenantAuth, allowAdminAndHR, getAllComms);
router.get('/get-itreport',protect, tenantAuth, allowAdminAndHR, getAllITReports);

export default router;
