import express from 'express';
import { allowAdminAndHR, allowAllRoles, allowEmployeesOnly, allowTeamLead, protect } from '../middleware/auth.middleware';
import { tenantAuth } from '../middleware/tenantAuth';
import { createTraining, getAllTrainings, submitFeedback } from '../controllers/trainingController';

const router = express.Router();

router.post('/create',protect, tenantAuth, allowTeamLead, createTraining);
router.post('/:id',protect, tenantAuth, allowEmployeesOnly, submitFeedback);
router.get('/get-all',protect, tenantAuth, allowAllRoles,  getAllTrainings);

export default router;
