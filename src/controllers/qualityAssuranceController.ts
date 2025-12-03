import { NextFunction } from 'express';
import { TypedRequest } from '../types/typedRequest';
import { asyncHandler } from '../middleware/asyncHandler';
import { QualityAssurance } from '../models/QualityAssurance';
import { TypedResponse } from '../types/typedResponse';
import ErrorResponse from '../utils/ErrorResponse';
import Company from '../models/Company';
import mongoose from 'mongoose';

// CREATE QUALITY ASSURANCE
// export const createQualityAssurance = asyncHandler(
//   async (
//     req: TypedRequest<
//       {},
//       {},
//       {
//         agentName: string;
//         week: number;
//         score: number;
//         remarks?: string;
//         evaluatedBy?: string;
//         company?: string;
//       }
//     >,
//     res: TypedResponse<any>,
//     next: NextFunction,
//   ) => {
//     console.log('Request Body:', req.body.company);

//     if (!company) return next(new ErrorResponse('Invalid company context', 400));

//     const { agentName, week, score, remarks, evaluatedBy, company } = req.body;
//     if (!agentName || !week || score == null) {
//       return next(new ErrorResponse('Agent name, week, and score are required', 400));
//     }

//     const qa = await QualityAssurance.create({
//       agentName,
//       week,
//       score,
//       remarks,
//       evaluatedBy,
//       company,
//       createdAt: new Date(),
//     });

//     res.status(201).json({ success: true, data: qa });
//   },
// );

export const createQualityAssurance = asyncHandler(
  async (
    req: TypedRequest<
      {},
      {},
      {
        agentName: string;
        week: number;
        score: number;
        remarks?: string;
        evaluatedBy?: string;
        company?: string;
      }
    >,
    res: TypedResponse<any>,
    next: NextFunction,
  ) => {


    const { agentName, week, score, remarks, evaluatedBy, company } = req.body;

    // 1. Require companyId
    if (!company) {
      return next(new ErrorResponse('Company is required', 400));
    }

    // 2. Validate MongoDB ObjectId format
    if (!mongoose.Types.ObjectId.isValid(company)) {
      return next(new ErrorResponse('Invalid company ID format', 400));
    }

    // 3. Check if company exists in DB
    const foundCompany = await Company.findById(req.body?.company);
    if (!foundCompany) {
      return next(new ErrorResponse('Company does not exist', 404));
    }

    // 4. Validate required fields
    if (!agentName || !week || score == null) {
      return next(
        new ErrorResponse('Agent name, week, and score are required', 400)
      );
    }

    // 5. Create QA record
    const qa = await QualityAssurance.create({
      agentName,
      week,
      score,
      remarks,
      evaluatedBy,
      company,
      createdAt: new Date(),
    });

    res.status(201).json({ success: true, data: qa });
  },
);


// GET ALL QUALITY ASSURANCE RECORDS
export const getAllQualityAssurance = asyncHandler(
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
    if (!companyId) return next(new ErrorResponse('Invalid company context', 400));

    const page = parseInt(req.query.page ?? '1', 10);
    const limit = parseInt(req.query.limit ?? '50', 10);
    const skip = (page - 1) * limit;

    const search = req.query.search?.trim();
    const startDate = req.query.startDate;
    const filters: any = { company: companyId };

    if (search) {
      filters.$or = [
        { agentName: { $regex: search, $options: 'i' } },
        { remarks: { $regex: search, $options: 'i' } },
        { evaluatedBy: { $regex: search, $options: 'i' } },
      ];
    }

    if (startDate) filters.createdAt = { $gte: new Date(startDate) };

    const [qas, total] = await Promise.all([
      QualityAssurance.find(filters)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('company')
        .lean({ virtuals: true }),
      QualityAssurance.countDocuments(filters),
    ]);

    const pages = Math.ceil(total / limit);
    res.status(200).json({
      success: true,
      data: { data: qas, pagination: { total, page, limit, pages }, count: qas.length },
    });
  },
);
