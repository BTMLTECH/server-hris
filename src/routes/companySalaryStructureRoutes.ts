import express from 'express';
import { allowAdminAndHR, protect } from '../middleware/auth.middleware';
import { tenantAuth } from '../middleware/tenantAuth';
import { createOrUpdateCompanySalary, getCompanySalary, updateCompanySalaryStructure } from '../controllers/companySalaryStructureController';



const router = express.Router();

router.post('/', protect, tenantAuth, allowAdminAndHR, createOrUpdateCompanySalary);
router.put('/:id', protect, tenantAuth, allowAdminAndHR, updateCompanySalaryStructure);
router.get('/:companyId', protect, tenantAuth, allowAdminAndHR,  getCompanySalary);

export default router;
