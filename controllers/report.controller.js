"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReportController = void 0;
const report_service_1 = require("../services/report.service");
const reportService = new report_service_1.ReportService();
class ReportController {
    async generateEmploymentSummary(req, res, next) {
        try {
            await reportService.generateReport(req.body, res, next);
        }
        catch (err) {
            return res.status(500).json({ error: 'Failed to generate report' });
        }
    }
}
exports.ReportController = ReportController;
