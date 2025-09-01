"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_middleware_1 = require("../middleware/auth.middleware");
const tenantAuth_1 = require("../middleware/tenantAuth");
const cooperativeContributionController_1 = require("../controllers/cooperativeContributionController");
const uploadHandover_1 = __importDefault(require("../middleware/uploadHandover"));
const router = express_1.default.Router();
router.post('/notify', auth_middleware_1.protect, tenantAuth_1.tenantAuth, auth_middleware_1.allowAllRoles, uploadHandover_1.default.single('file'), cooperativeContributionController_1.notifyHr);
router.patch('/add/:id', auth_middleware_1.protect, tenantAuth_1.tenantAuth, auth_middleware_1.allowAdminAndHR, cooperativeContributionController_1.approveCooperativeContribution);
router.put('/:id', auth_middleware_1.protect, tenantAuth_1.tenantAuth, auth_middleware_1.allowAdminAndHR, cooperativeContributionController_1.updateCooperativeContribution);
router.delete('/:id', auth_middleware_1.protect, tenantAuth_1.tenantAuth, auth_middleware_1.allowAdminAndHR, cooperativeContributionController_1.rejectCooperativeContribution);
router.get('/get-all', auth_middleware_1.protect, tenantAuth_1.tenantAuth, auth_middleware_1.allowAllRoles, cooperativeContributionController_1.getAllCooperativeContributions);
exports.default = router;
