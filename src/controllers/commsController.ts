import { NextFunction } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { Comms } from '../models/Comms';
import { TypedRequest } from '../types/typedRequest';
import { TypedResponse } from '../types/typedResponse';
import ErrorResponse from '../utils/ErrorResponse';

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
      }
    >,
    res: TypedResponse<any>,
    next: NextFunction,
  ) => {
    const companyId = req.company?._id;
    if (!companyId) return next(new ErrorResponse('Invalid company context', 400));

    const { sender, receiver, subject, message, status } = req.body;
    if (!sender || !receiver || !subject || !message) {
      return next(new ErrorResponse('All fields are required', 400));
    }

    const comms = await Comms.create({
      sender,
      receiver,
      subject,
      message,
      status: status || 'sent',
      company: companyId,
      dateSent: new Date(),
    });

    res.status(201).json({ success: true, data: comms });
  },
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
