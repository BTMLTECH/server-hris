"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_middleware_1 = require("../middleware/auth.middleware");
const tenantAuth_1 = require("../middleware/tenantAuth");
const uploadHandover_1 = __importDefault(require("../middleware/uploadHandover"));
const handoverController_1 = require("../controllers/handoverController");
const router = express_1.default.Router();
router.post('/create', auth_middleware_1.protect, tenantAuth_1.tenantAuth, auth_middleware_1.allowEmployeesOnly, uploadHandover_1.default.single('file'), handoverController_1.createHandoverReport);
// Get My Reports
router.get('/report', auth_middleware_1.protect, tenantAuth_1.tenantAuth, auth_middleware_1.allowEmployeesOnly, handoverController_1.getMyHandovers);
router.get('/reports', auth_middleware_1.protect, tenantAuth_1.tenantAuth, auth_middleware_1.allowAllRoles, handoverController_1.getTeamLeadByEmployeeDepartment);
router.delete('/report/:id', auth_middleware_1.protect, tenantAuth_1.tenantAuth, auth_middleware_1.allowEmployeesOnly, handoverController_1.deleteHandoverById);
exports.default = router;
