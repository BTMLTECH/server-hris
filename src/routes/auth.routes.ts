import express from 'express';
import {
  login,
  verify2FA,
  // forgotPassword,
  inviteUser,
  refreshAccessToken,
  logout,
  setupPassword,
  bulkImportUsers,
  // registerAdmin,
  requestPassword,
  sendActivationPasswordLink,
  resend2FACode,
  registerAdmin
} from '../controllers/authController';
import { allowAdminAndHR, allowAdminOnly, allowEmployeesOnly, authorizeRoles, protect } from '../middleware/auth.middleware';
import multer from 'multer';
import path from 'path';
import { createCompanyWithAdmin, resendActivationLink } from '../controllers/companyController';
// import { createRolesForCompany } from '../controllers/roleController';
import { tenantAuth } from '../middleware/tenantAuth';
import uploadHandover from '../middleware/uploadHandover';



const router = express.Router();

router.post('/admin-register', registerAdmin);
router.post(
  '/owner-create',
  createCompanyWithAdmin
);
// router.post('/roles', protect, tenantAuth, allowAdminOnly, createRolesForCompany);
router.post('/login', login);
router.post('/verify-2fa', verify2FA);
// router.post('/reset-password/:token', resetPassword);
router.post('/refresh', refreshAccessToken);
router.post('/request-password', requestPassword);
router.post('/resend-password', resend2FACode);
router.post('/reset-activation', resendActivationLink);
router.post('/send-password', protect, tenantAuth, allowAdminOnly, sendActivationPasswordLink);
router.post('/set-password', setupPassword);
router.post('/refresh-token', refreshAccessToken);
// router.post('/logout', protect,tenantAuth, logout);
router.post('/logout', logout);

// Invite (Admin only)
// const storage = multer.diskStorage({
//   destination: path.join(__dirname, '..', 'uploads'),
  
//   filename: (req, file, cb) => {
//     cb(null, `${Date.now()}-${file.originalname}`);
//   },
// });

// const upload = multer({ storage });

router.post(
  '/invite-user',
  protect,
  tenantAuth,
  allowAdminAndHR,
  inviteUser
);

router.post(
  '/bulk-invite',
  protect,
  tenantAuth,
  allowAdminAndHR,
  uploadHandover.single('file'),
  bulkImportUsers
);

export default router;
