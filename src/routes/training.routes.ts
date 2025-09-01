"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_middleware_1 = require("../middleware/auth.middleware");
const tenantAuth_1 = require("../middleware/tenantAuth");
const trainingController_1 = require("../controllers/trainingController");
const router = express_1.default.Router();
router.post('/create', auth_middleware_1.protect, tenantAuth_1.tenantAuth, auth_middleware_1.allowTeamLead, trainingController_1.createTraining);
router.post('/:id', auth_middleware_1.protect, tenantAuth_1.tenantAuth, auth_middleware_1.allowEmployeesOnly, trainingController_1.submitFeedback);
router.get('/get-all', auth_middleware_1.protect, tenantAuth_1.tenantAuth, auth_middleware_1.allowAllRoles, trainingController_1.getAllTrainings);
exports.default = router;
