"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const departmentController_1 = require("../controllers/departmentController");
const auth_middleware_1 = require("../middleware/auth.middleware");
const tenantAuth_1 = require("../middleware/tenantAuth");
const router = express_1.default.Router();
// router.post('/bulk', bulkCreateDepartments);
router.post('/bulk', auth_middleware_1.protect, tenantAuth_1.tenantAuth, auth_middleware_1.allowAdminAndHR, departmentController_1.bulkCreateDepartments);
router.put('/departments/:id', auth_middleware_1.protect, tenantAuth_1.tenantAuth, auth_middleware_1.allowAdminAndHR, departmentController_1.updateDepartment);
router.get('/get-all', auth_middleware_1.protect, tenantAuth_1.tenantAuth, auth_middleware_1.allowAdminAndHR, departmentController_1.getAllDepartments);
exports.default = router;
