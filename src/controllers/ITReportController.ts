import { NextFunction } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { ITReport } from '../models/ITReport';
import { TypedRequest } from '../types/typedRequest';
import { TypedResponse } from '../types/typedResponse';
import ErrorResponse from '../utils/ErrorResponse';
import { ReportTypes } from '../types/linkType';
import mongoose from 'mongoose';
import Company from '../models/Company';


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
        company: string;
      }
    >,
    res: TypedResponse<any>,
    next: NextFunction
  ) => {
    const { name, week, task, company } = req.body;

    // 1. Require companyId
    if (!company) {
      return next(new ErrorResponse("Company is required", 400));
    }

    // 2. Validate MongoDB ObjectId format
    if (!mongoose.Types.ObjectId.isValid(company)) {
      return next(new ErrorResponse("Invalid company ID format", 400));
    }

    // 3. Check if company exists in DB
    const foundCompany = await Company.findById(company);
    if (!foundCompany) {
      return next(new ErrorResponse("Company does not exist", 404));
    }

    // 4. Validate required fields
    if (!name || !week || !task) {
      return next(
        new ErrorResponse(
          "All fields (name, week, task) are required",
          400
        )
      );
    }

    // 5. Create IT report
    const report = await ITReport.create({
      name,
      week,
      task,
      company,
      createdAt: new Date(),
    });

    res.status(201).json({
      success: true,
      data: report,
    });
  }
);




export const createReportLink = asyncHandler(
  async (
    req: TypedRequest<{}, {}, { data: ReportTypes }>,
    res: TypedResponse<any>,
    next: NextFunction,
  ) => {
    const companyId = req.company?._id;
    if (!companyId) {
      return next(new ErrorResponse('Invalid company context', 400));
    }

    const { data } = req.body;


    // Validate data
    const validdatas: ReportTypes[] = ['quality', 'operations', 'comms', 'it'];
    if (!data || !validdatas.includes(data)) {
      return next(new ErrorResponse('Invalid report data', 400));
    }

    // Generate the frontend link
    const link = `${process.env.FRONTEND_URL}/${data}/${companyId}`;

    res.status(200).json({
      success: true,
      data:link,
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
      ITReport.find(filters)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('company')
        .lean({ virtuals: true }),
      ITReport.countDocuments(filters),
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


