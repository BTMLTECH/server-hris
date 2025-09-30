import express from 'express';
import {
  login,
  verify2FA,
  refreshAccessToken,
  requestPassword,
  resend2FACode,
  setupPassword,
  sendActivationPasswordLink,
  getNextStaffId,
  logout,
  inviteUser,
  bulkImportUsers,
} from '../controllers/authController';
import { protect, allowAdminAndHR } from '../middleware/auth.middleware';
import { tenantAuth } from '../middleware/tenantAuth';
import { createCompanyWithAdmin, resendActivationLink } from '../controllers/companyController';
import uploadHandover from '../middleware/uploadHandover';

const router = express.Router();

router.post('/owner-create', createCompanyWithAdmin);
router.post('/login', login);
router.post('/verify-2fa', verify2FA);
router.post('/refresh', refreshAccessToken);
router.post('/request-password', requestPassword);
router.post('/resend-password', resend2FACode);
router.post('/reset-activation', protect, tenantAuth, allowAdminAndHR, resendActivationLink);
router.post('/send-password', protect, tenantAuth, allowAdminAndHR, sendActivationPasswordLink);
router.post('/set-password', setupPassword);
router.post('/refresh-token', refreshAccessToken);
router.get('/last-staffId', protect, tenantAuth, allowAdminAndHR, getNextStaffId);
router.post('/logout', logout);
router.post('/invite-user', protect, tenantAuth, allowAdminAndHR, inviteUser);
router.post(
  '/bulk-invite',
  protect,
  tenantAuth,
  allowAdminAndHR,
  uploadHandover.single('file'),
  bulkImportUsers,
);

export default router;
