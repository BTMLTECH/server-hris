import { NextFunction } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import Report from '../models/Report';
import { TypedRequest } from '../types/typedRequest';
import { TypedResponse } from '../types/typedResponse';
import ErrorResponse from '../utils/ErrorResponse';

/**
 * @desc    Create a new Report
 * @route   POST /api/reports
 * @access  Private
 */
export const createITReport = asyncHandler(
  async (
    req: TypedRequest<
      {},
      {},
      {
        name: string;
        week: number;
        task: string;
      }
    >,
    res: TypedResponse<any>,
    next: NextFunction,
  ) => {
    const companyId = req.company?._id;
    if (!companyId) {
      return next(new ErrorResponse('Invalid company context', 400));
    }

    const { name, week, task } = req.body;

    if (!name || !week || !task) {
      return next(new ErrorResponse('All fields (name, week, task) are required', 400));
    }

    const report = await Report.create({
      name,
      week,
      task,
      company: companyId,
      createdAt: new Date(),
    });

    res.status(201).json({
      success: true,
      data: report,
    });
  },
);

/**
 * @desc    Get all Reports (with pagination, search, and optional startDate)
 * @route   GET /api/reports
 * @access  Private
 */
export const getAllITReports = asyncHandler(
  async (
    req: TypedRequest<
      {},
      { page?: string; limit?: string; search?: string; startDate?: string },
      {}
    >,
    res: TypedResponse<any>,
    next: NextFunction,
  ) => {
    const companyId = req.company?._id;
    if (!companyId) {
      return next(new ErrorResponse('Invalid company context', 400));
    }

    const page = parseInt(req.query.page ?? '1', 10);
    const limit = parseInt(req.query.limit ?? '50', 10);
    const skip = (page - 1) * limit;

    const search = req.query.search?.trim();
    const startDate = req.query.startDate;

    // --- Base filters ---
    const filters: any = { company: companyId };

    if (search) {
      filters.$or = [
        { name: { $regex: search, $options: 'i' } },
        { task: { $regex: search, $options: 'i' } },
      ];
    }

    if (startDate) {
      filters.createdAt = { $gte: new Date(startDate) };
    }

    // --- Fetch and paginate ---
    const [reports, total] = await Promise.all([
      Report.find(filters)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('company')
        .lean({ virtuals: true }),
      Report.countDocuments(filters),
    ]);

    const pages = Math.ceil(total / limit);

    res.status(200).json({
      success: true,
      data: {
        data: reports,
        pagination: { total, page, limit, pages },
        count: reports.length,
      },
    });
  },
);
