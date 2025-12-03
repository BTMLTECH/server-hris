import { NextFunction } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { Comms } from '../models/Comms';
import { TypedRequest } from '../types/typedRequest';
import { TypedResponse } from '../types/typedResponse';
import ErrorResponse from '../utils/ErrorResponse';
import mongoose from 'mongoose';
import Company from '../models/Company';

// CREATE COMMS
export const createComms = asyncHandler(
  async (
    req: TypedRequest<
      {},
      {},
      {
        sender: string;
        receiver: string;
        subject: string;
        message: string;
        status?: 'sent' | 'delivered' | 'read';
        company: string;
      }
    >,
    res: TypedResponse<any>,
    next: NextFunction
  ) => {
    const { sender, receiver, subject, message, status, company } = req.body;

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
    if (!sender || !receiver || !subject || !message) {
      return next(new ErrorResponse('All fields are required', 400));
    }

    // 5. Create communication record
    const comms = await Comms.create({
      sender,
      receiver,
      subject,
      message,
      status: status || 'sent',
      company,
      dateSent: new Date(),
    });

    res.status(201).json({
      success: true,
      data: comms,
    });
  }
);


// GET ALL COMMS
export const getAllComms = asyncHandler(
  async (
    req: TypedRequest<
      {},
      { page?: string; limit?: string; search?: string; startDate?: string; status?: string },
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
    const status = req.query.status;
    const filters: any = { company: companyId };

    if (status && status !== 'all') filters.status = status.toLowerCase();

    if (search) {
      filters.$or = [
        { sender: { $regex: search, $options: 'i' } },
        { receiver: { $regex: search, $options: 'i' } },
        { subject: { $regex: search, $options: 'i' } },
        { message: { $regex: search, $options: 'i' } },
      ];
    }

    if (startDate) filters.dateSent = { $gte: new Date(startDate) };

    const [comms, total] = await Promise.all([
      Comms.find(filters)
        .sort({ dateSent: -1 })
        .skip(skip)
        .limit(limit)
        .populate('company')
        .lean({ virtuals: true }),
      Comms.countDocuments(filters),
    ]);

    const pages = Math.ceil(total / limit);
    res.status(200).json({
      success: true,
      data: { data: comms, pagination: { total, page, limit, pages }, count: comms.length },
    });
  },
);
