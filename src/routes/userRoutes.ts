import express from 'express';
import { deleteEmployee, getAllUsers, getMyProfile, updateMyProfile, uploadProfilePicture } from '../controllers/userController';
import { allowAdminAndHR, allowAdminOnly, allowAllRoles, protect } from '../middleware/auth.middleware';
import { tenantAuth } from '../middleware/tenantAuth';
import uploadHandover from '../middleware/uploadHandover';



const router = express.Router();



router.get(
  '/me',
  protect,
  tenantAuth,
  allowAllRoles,
  getMyProfile
);

router.put(
  '/me',
  protect,
  tenantAuth,
  allowAllRoles,
  updateMyProfile
);

router.put(
  '/upload',
  protect,
  tenantAuth,
  allowAllRoles,
  uploadHandover.single('file'),
  uploadProfilePicture
);

router.get(
  '/users',
  protect,
  tenantAuth,
  allowAdminAndHR,
  getAllUsers
);

router.delete(
  '/:id',
  protect,
  tenantAuth,
  allowAdminAndHR,
  deleteEmployee
);

export default router;
