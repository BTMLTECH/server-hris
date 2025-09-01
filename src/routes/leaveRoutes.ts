"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const leaveController_1 = require("../controllers/leaveController");
const auth_middleware_1 = require("../middleware/auth.middleware");
const tenantAuth_1 = require("../middleware/tenantAuth");
const uploadHandover_1 = __importDefault(require("../middleware/uploadHandover"));
const router = express_1.default.Router();
router.post('/request', auth_middleware_1.protect, tenantAuth_1.tenantAuth, auth_middleware_1.allowEveryone, uploadHandover_1.default.single('file'), leaveController_1.createLeaveRequest);
router.post('/:id/approve', auth_middleware_1.protect, tenantAuth_1.tenantAuth, auth_middleware_1.allowAllRoles, leaveController_1.approveLeaveRequest);
router.post('/:id/reject', auth_middleware_1.protect, tenantAuth_1.tenantAuth, auth_middleware_1.allowAllRoles, leaveController_1.rejectLeaveRequest);
router.get('/leave-queue', auth_middleware_1.protect, tenantAuth_1.tenantAuth, auth_middleware_1.allowEveryone, leaveController_1.getLeaveApprovalQueue);
router.get('/activity-feed', auth_middleware_1.protect, tenantAuth_1.tenantAuth, auth_middleware_1.allowEveryone, leaveController_1.getLeaveActivityFeed);
router.get('/teamlead', auth_middleware_1.protect, tenantAuth_1.tenantAuth, auth_middleware_1.allowEveryone, leaveController_1.getLeaveApprovers);
router.get('/status-overview', auth_middleware_1.protect, tenantAuth_1.tenantAuth, auth_middleware_1.allowEveryone, leaveController_1.getLeaveStatusOverview);
exports.default = router;
