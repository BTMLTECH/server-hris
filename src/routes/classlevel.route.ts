"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_middleware_1 = require("../middleware/auth.middleware");
const tenantAuth_1 = require("../middleware/tenantAuth");
const ClasslevelController_1 = require("../controllers/ClasslevelController");
const uploadHandover_1 = __importDefault(require("../middleware/uploadHandover"));
const router = express_1.default.Router();
router.post('/class', auth_middleware_1.protect, tenantAuth_1.tenantAuth, auth_middleware_1.allowAdminAndHR, ClasslevelController_1.calculateClass);
router.post('/single', auth_middleware_1.protect, tenantAuth_1.tenantAuth, auth_middleware_1.allowAdminAndHR, ClasslevelController_1.createClassLevel);
router.post('/bulk', auth_middleware_1.protect, tenantAuth_1.tenantAuth, auth_middleware_1.allowAdminAndHR, uploadHandover_1.default.single('file'), ClasslevelController_1.bulkCreateClassLevels);
router.delete('/bulk-delete', auth_middleware_1.protect, tenantAuth_1.tenantAuth, auth_middleware_1.allowAdminAndHR, ClasslevelController_1.bulkDeleteClassLevelsByYear);
router.get('/get-all', auth_middleware_1.protect, tenantAuth_1.tenantAuth, auth_middleware_1.allowAdminAndHR, ClasslevelController_1.getAllClassLevels);
exports.default = router;
