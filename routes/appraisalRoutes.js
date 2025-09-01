"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const AppraisalController_1 = require("../controllers/AppraisalController");
const auth_middleware_1 = require("../middleware/auth.middleware");
const tenantAuth_1 = require("../middleware/tenantAuth");
const router = express_1.default.Router();
router.post('/request', auth_middleware_1.protect, tenantAuth_1.tenantAuth, auth_middleware_1.allowEveryone, AppraisalController_1.createAppraisalRequest);
router.patch('/update/:id', auth_middleware_1.protect, tenantAuth_1.tenantAuth, auth_middleware_1.allowEveryone, AppraisalController_1.updateAppraisalRequest);
router.post('/:id/approve', auth_middleware_1.protect, tenantAuth_1.tenantAuth, auth_middleware_1.allowTeamLeadHRManager, AppraisalController_1.approveAppraisalRequest);
router.post('/:id/reject', auth_middleware_1.protect, tenantAuth_1.tenantAuth, auth_middleware_1.allowTeamLeadHRManager, AppraisalController_1.rejectAppraisalRequest);
router.get('/appraisal-queue', auth_middleware_1.protect, tenantAuth_1.tenantAuth, auth_middleware_1.allowEveryone, AppraisalController_1.getAppraisalApprovalQueue);
router.get('/activity', auth_middleware_1.protect, tenantAuth_1.tenantAuth, auth_middleware_1.allowEveryone, AppraisalController_1.getAppraisalActivity);
router.get('/get-employee', auth_middleware_1.protect, tenantAuth_1.tenantAuth, auth_middleware_1.allowTeamLead, AppraisalController_1.getEmployeesByTeamLeadDepartment);
exports.default = router;
