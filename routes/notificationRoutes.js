"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_middleware_1 = require("../middleware/auth.middleware");
const tenantAuth_1 = require("../middleware/tenantAuth");
const notificationController_1 = require("../controllers/notificationController");
const router = express_1.default.Router();
router.use(auth_middleware_1.protect, tenantAuth_1.tenantAuth);
router.get('/', auth_middleware_1.protect, tenantAuth_1.tenantAuth, auth_middleware_1.allowAllRoles, notificationController_1.getNotifications);
router.patch('/:id/read', auth_middleware_1.protect, tenantAuth_1.tenantAuth, auth_middleware_1.allowEmployeesOnly, notificationController_1.markAsRead);
router.patch('/read-all', auth_middleware_1.protect, tenantAuth_1.tenantAuth, auth_middleware_1.allowAdminAndHR, notificationController_1.markAllAsRead);
router.delete('/:id', auth_middleware_1.protect, tenantAuth_1.tenantAuth, auth_middleware_1.allowAdminAndHR, notificationController_1.deleteNotification);
exports.default = router;
