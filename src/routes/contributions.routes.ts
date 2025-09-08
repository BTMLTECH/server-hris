import express from 'express';
import { allowAdminAndHR, allowAllRoles, protect } from '../middleware/auth.middleware';
import { tenantAuth } from '../middleware/tenantAuth';
import { approveCooperativeContribution, rejectCooperativeContribution, getAllCooperativeContributions, notifyHr, updateCooperativeContribution } from '../controllers/cooperativeContributionController';
import uploadHandover from '../middleware/uploadHandover';

const router = express.Router();

router.post('/notify', protect, tenantAuth, allowAllRoles, uploadHandover.single('file'), notifyHr);
router.patch('/add/:id',protect, tenantAuth, allowAdminAndHR, approveCooperativeContribution);
router.put('/:id',protect, tenantAuth, allowAdminAndHR, updateCooperativeContribution);
router.delete('/:id',protect, tenantAuth, allowAdminAndHR,rejectCooperativeContribution);
router.get('/get-all',protect, tenantAuth, allowAllRoles,  getAllCooperativeContributions);

export default router;
