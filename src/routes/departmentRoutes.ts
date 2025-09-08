import express from 'express';
import { bulkCreateDepartments, getAllDepartments, updateDepartment } from '../controllers/departmentController';
import { allowAdminAndHR, protect } from '../middleware/auth.middleware';
import { tenantAuth } from '../middleware/tenantAuth';

const router = express.Router();

// router.post('/bulk', bulkCreateDepartments);
router.post('/bulk', protect, tenantAuth, allowAdminAndHR, bulkCreateDepartments);
router.put('/departments/:id', protect, tenantAuth, allowAdminAndHR, updateDepartment);
router.get('/get-all', protect, tenantAuth, allowAdminAndHR, getAllDepartments);

export default router;
