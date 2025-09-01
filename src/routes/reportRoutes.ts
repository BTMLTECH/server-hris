"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../middleware/auth.middleware");
const tenantAuth_1 = require("../middleware/tenantAuth");
const report_controller_1 = require("../controllers/report.controller");
const router = (0, express_1.Router)();
const reportController = new report_controller_1.ReportController();
// Routes
router.post('/get-employee-summary', auth_middleware_1.protect, tenantAuth_1.tenantAuth, auth_middleware_1.allowAdminAndHR, reportController.generateEmploymentSummary.bind(reportController));
exports.default = router;
