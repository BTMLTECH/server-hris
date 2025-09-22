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

// GET /me → get logged-in user profile
router.get('/me', protect, tenantAuth, allowAllRoles, getMyProfile);

// GET /analytics → dashboard analytics
router.get('/analytics', protect, tenantAuth, allowAllRoles, generateAnalyticsAndDashboard);

// PUT /:id → update user profile
router.put('/:id', protect, tenantAuth, allowAdminAndHR, updateMyProfile);

// PUT /upload → upload profile picture
router.put(
  '/upload',
  protect,
  tenantAuth,
  allowAllRoles,
  uploadHandover.single('file'),
  uploadProfilePicture,
);

// GET /users → list all users
router.get('/users', protect, tenantAuth, allowAllRoles, getAllUsers);

// DELETE /:id → delete an employee
router.delete('/:id', protect, tenantAuth, allowAdminAndHR, deleteEmployee);

// DELETE /:id/terminate → terminate an employee
router.delete('/:id/terminate', protect, tenantAuth, allowAdminAndHR, terminateEmployee);

// DELETE /:id/activate → activate an employee
router.delete('/:id/activate', protect, tenantAuth, allowAdminAndHR, activateEmployee);

export default router;
