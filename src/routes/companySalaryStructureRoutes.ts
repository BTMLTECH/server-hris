"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_middleware_1 = require("../middleware/auth.middleware");
const tenantAuth_1 = require("../middleware/tenantAuth");
const companySalaryStructureController_1 = require("../controllers/companySalaryStructureController");
const router = express_1.default.Router();
router.post('/', auth_middleware_1.protect, tenantAuth_1.tenantAuth, auth_middleware_1.allowAdminAndHR, companySalaryStructureController_1.createOrUpdateCompanySalary);
router.put('/:id', auth_middleware_1.protect, tenantAuth_1.tenantAuth, auth_middleware_1.allowAdminAndHR, companySalaryStructureController_1.updateCompanySalaryStructure);
router.get('/:companyId', auth_middleware_1.protect, tenantAuth_1.tenantAuth, auth_middleware_1.allowAdminAndHR, companySalaryStructureController_1.getCompanySalary);
exports.default = router;
