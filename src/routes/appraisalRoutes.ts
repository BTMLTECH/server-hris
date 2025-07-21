import express from 'express';
import { approveAppraisalRequest, createAppraisalRequest, getAppraisalApprovalQueue, rejectAppraisalRequest } from '../controllers/AppraisalController';
import { allowEveryone, allowTeamLeadHRManager, protect } from '../middleware/auth.middleware';
import { tenantAuth } from '../middleware/tenantAuth';


const router = express.Router();

router.post('/request', protect, tenantAuth, allowEveryone, createAppraisalRequest);
router.post('/:id/approve', protect, tenantAuth, allowTeamLeadHRManager, approveAppraisalRequest);
router.post('/:id/reject', protect, tenantAuth, allowTeamLeadHRManager, rejectAppraisalRequest);
router.get('/appraisal-queue', protect, tenantAuth, allowEveryone, getAppraisalApprovalQueue);


export default router;
