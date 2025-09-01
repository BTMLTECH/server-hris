import { NextFunction, Request, Response } from 'express';
import { ReportService } from '../services/report.service';

const reportService = new ReportService();

export class ReportController {
  async generateEmploymentSummary(req: Request, res: Response, next: NextFunction) {
    try {
      await reportService.generateReport(req.body, res, next);
    } catch (err) {
      return res.status(500).json({ error: 'Failed to generate report' });
    }
  }
}
