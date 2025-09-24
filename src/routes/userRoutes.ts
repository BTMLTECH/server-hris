import express from 'express';
import { protect, allowAllRoles, allowAdminAndHR } from '../middleware/auth.middleware';
import { tenantAuth } from '../middleware/tenantAuth';
import uploadHandover from '../middleware/uploadHandover';
import {
  getMyProfile,
  updateMyProfile,
  uploadProfilePicture,
  getAllUsers,
  deleteEmployee,
  terminateEmployee,
  activateEmployee,
} from '../controllers/userController';
import { generateAnalyticsAndDashboard } from '../controllers/generateAnalytics';

const router = express.Router();

router.get('/me', protect, tenantAuth, allowAllRoles, getMyProfile);

router.get('/analytics', protect, tenantAuth, allowAllRoles, generateAnalyticsAndDashboard);

router.put('/:id', protect, tenantAuth, allowAdminAndHR, updateMyProfile);

router.put(
  '/upload/profile',
  protect,
  tenantAuth,
  allowAllRoles,
  uploadHandover.single('file'),
  uploadProfilePicture,
);

router.get('/users', protect, tenantAuth, allowAllRoles, getAllUsers);

router.delete('/:id', protect, tenantAuth, allowAdminAndHR, deleteEmployee);

router.delete('/:id/terminate', protect, tenantAuth, allowAdminAndHR, terminateEmployee);

router.delete('/:id/activate', protect, tenantAuth, allowAdminAndHR, activateEmployee);

export default router;
