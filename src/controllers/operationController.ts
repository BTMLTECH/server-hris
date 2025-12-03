import { NextFunction } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { OperationReport } from '../models/Operation';
import { TypedRequest } from '../types/typedRequest';
import { TypedResponse } from '../types/typedResponse';
import ErrorResponse from '../utils/ErrorResponse';
import mongoose from 'mongoose';
import Company from '../models/Company';

export const createOperation = asyncHandler(
  async (
    req: TypedRequest<
      {},
      {},
      {
        consultantName: string;
        shift: 'day' | 'night';
        clientName: string;
        PNR: string;
        ticketNumber: string;
        details: string;
        company: string;
      }
    >,
    res: TypedResponse<any>,
    next: NextFunction
  ) => {
    const {
      consultantName,
      shift,
      clientName,
      PNR,
      ticketNumber,
      details,
      company,
    } = req.body;

    // 1. Require companyId
    if (!company) {
      return next(new ErrorResponse('Company is required', 400));
    }

    // 2. Validate MongoDB ObjectId format
    if (!mongoose.Types.ObjectId.isValid(company)) {
      return next(new ErrorResponse('Invalid company ID format', 400));
    }

    // 3. Check if company exists in DB
    const foundCompany = await Company.findById(company);
    if (!foundCompany) {
      return next(new ErrorResponse('Company does not exist', 404));
    }

    // 4. Validate required fields
    if (!consultantName || !shift || !clientName || !PNR || !ticketNumber || !details) {
      return next(new ErrorResponse('All fields are required', 400));
    }

    // 5. Create operation report
    const operation = await OperationReport.create({
      consultantName,
      shift,
      clientName,
      PNR,
      ticketNumber,
      details,
      company,
      createdAt: new Date(),
    });

    res.status(201).json({
      success: true,
      data: operation,
    });
  }
);


export const getAllOperations = asyncHandler(
  async (
    req: TypedRequest<
      {},
      {
        page?: string;
        limit?: string;
        search?: string;
        shift?: string;
        startDate?: string;
      },
      {}
    >,
    res: TypedResponse<any>,
    next: NextFunction,
  ) => {
    const companyId = req.company?._id;
    if (!companyId) {
      return next(new ErrorResponse('Invalid company context', 400));
    }

    // 🧭 Pagination setup
    const page = parseInt(req.query.page ?? '1', 10);
    const limit = parseInt(req.query.limit ?? '50', 10);
    const skip = (page - 1) * limit;

    // 🧩 Query params
    const search = req.query.search?.trim();
    const shift = req.query.shift;
    const startDate = req.query.startDate;

    // --- Base filters ---
    const filters: any = { company: companyId };

    // Filter by shift
    if (shift && shift !== 'all') {
      filters.shift = shift.toLowerCase();
    }

    // Filter by start date
    if (startDate) {
      filters.createdAt = { $gte: new Date(startDate) };
    }

    // 🔍 Search filter
    if (search) {
      filters.$or = [
        { consultantName: { $regex: search, $options: 'i' } },
        { clientName: { $regex: search, $options: 'i' } },
        { PNR: { $regex: search, $options: 'i' } },
        { ticketNumber: { $regex: search, $options: 'i' } },
        { details: { $regex: search, $options: 'i' } },
      ];
    }

    // ⚙️ Fetch operations and total count in parallel
    const [operations, total] = await Promise.all([
      OperationReport.find(filters)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('company')
        .lean({ virtuals: true }),
      OperationReport.countDocuments(filters),
    ]);

    const pages = Math.ceil(total / limit);

    // ✅ Response
    res.status(200).json({
      success: true,
      data: {
        data: operations,
        pagination: { total, page, limit, pages },
        count: operations.length,
      },
    });
  },
);
