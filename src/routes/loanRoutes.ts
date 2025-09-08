import express from 'express';
import { protect, allowEveryone, allowTeamLeadHRManager } from '../middleware/auth.middleware';
import { tenantAuth } from '../middleware/tenantAuth';
import { approveLoanRequest, createLoanRequest, getLoanActivityFeed, getLoanApprovalQueue, getLoanBalanceOverview, getLoanStatusOverview, rejectLoanRequest } from '../controllers/loanController';
import { makeLoanRepayment, getRepaymentHistory } from '../controllers/repayment.controller';


const router = express.Router();

router.post('/request', protect, tenantAuth, allowEveryone, createLoanRequest);
router.post('/:id/approve', protect, tenantAuth, allowTeamLeadHRManager, approveLoanRequest);
router.post('/:id/reject', protect, tenantAuth, allowTeamLeadHRManager, rejectLoanRequest);
router.get('/loan-queue', protect, tenantAuth, allowEveryone, getLoanApprovalQueue);
router.get('/activity-feed', protect, tenantAuth, allowEveryone, getLoanActivityFeed);
router.get('/status-overview', protect, tenantAuth, allowEveryone, getLoanStatusOverview);
router.get('/balance-overview', protect, tenantAuth, allowEveryone, getLoanBalanceOverview);
router.post('/loan-repayment', protect, tenantAuth, allowEveryone, makeLoanRepayment);
router.get('/repayment-history', protect, tenantAuth, allowEveryone, getRepaymentHistory);

export default router;
