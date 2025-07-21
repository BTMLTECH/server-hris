import express from 'express';
import { approveLeaveRequest, createLeaveRequest, getLeaveApprovers, getLeaveActivityFeed, getLeaveApprovalQueue, getLeaveStatusOverview, rejectLeaveRequest } from '../controllers/leaveController';
import { protect, allowEveryone, allowTeamLeadHRManager } from '../middleware/auth.middleware';
import { tenantAuth } from '../middleware/tenantAuth';


const router = express.Router();

router.post('/request', protect, tenantAuth, allowEveryone, createLeaveRequest);
router.post('/:id/approve', protect, tenantAuth, allowTeamLeadHRManager, approveLeaveRequest);
router.post('/:id/reject', protect, tenantAuth, allowTeamLeadHRManager, rejectLeaveRequest);
router.get('/leave-queue', protect, tenantAuth, allowEveryone, getLeaveApprovalQueue);
router.get('/activity-feed', protect, tenantAuth, allowEveryone, getLeaveActivityFeed);
router.get('/teamlead', protect, tenantAuth, allowEveryone, getLeaveApprovers);
router.get('/status-overview', protect, tenantAuth, allowEveryone, getLeaveStatusOverview);
// router.get('/activity/team', protect, tenantAuth, allowTeamLeadHRManager, getTeamLeaveActivity);

export default router;
