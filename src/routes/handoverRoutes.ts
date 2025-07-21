import express from 'express';
import { allowAdminAndHR, allowAllRoles, allowEmployeesOnly, allowEveryone, allowTeamLead, allowTeamLeadHRManager, protect } from '../middleware/auth.middleware';
import { tenantAuth } from '../middleware/tenantAuth';
import uploadHandover from '../middleware/uploadHandover';
import { createHandoverReport, getMyHandovers, getTeamDepartmentHandovers, deleteHandoverById } from '../controllers/handoverController';



const router = express.Router();
router.post(
  '/create',
  protect,
  tenantAuth,
  allowEmployeesOnly,
  uploadHandover.single('file'),
  createHandoverReport
);

// Get My Reports
router.get(
  '/report',
  protect,
  tenantAuth,
  allowEmployeesOnly,
  getMyHandovers
);

router.get(
  '/reports',
  protect,
  tenantAuth,
  allowTeamLead,
  getTeamDepartmentHandovers
);

router.delete(
  '/report/:id',
  protect,
  tenantAuth,
  allowEmployeesOnly,
  deleteHandoverById
);


// Approve Report
// router.put(
//   '/:id/approve',
//   protect,
//   tenantAuth,
//   allowTeamLead,
//   approveHandoverReport
// );

// // Reject Report
// router.put(
//   '/:id/reject',
//   protect,
//   tenantAuth,
//   allowTeamLead,
//   rejectHandoverReport
// );

export default router;


