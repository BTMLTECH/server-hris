import express from 'express';
import { allowAdminAndHR, protect } from '../middleware/auth.middleware';
import { tenantAuth } from '../middleware/tenantAuth';
import { bulkCreateClassLevels, bulkDeleteClassLevelsByYear, calculateClass, createClassLevel, getAllClassLevels, updateClassLevel } from '../controllers/ClasslevelController';
import uploadHandover from '../middleware/uploadHandover';

const router = express.Router();

router.post('/class',protect, tenantAuth, allowAdminAndHR, calculateClass);
router.post('/single',protect, tenantAuth, allowAdminAndHR, createClassLevel);
router.post('/bulk',protect, tenantAuth, allowAdminAndHR, uploadHandover.single('file'), bulkCreateClassLevels);
router.delete('/bulk-delete',protect, tenantAuth, allowAdminAndHR, bulkDeleteClassLevelsByYear);
router.get('/get-all',protect, tenantAuth, allowAdminAndHR,  getAllClassLevels);

export default router;
