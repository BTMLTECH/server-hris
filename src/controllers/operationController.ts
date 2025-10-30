import { NextFunction } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { OperationReport } from '../models/Operation';
import { TypedRequest } from '../types/typedRequest';
import { TypedResponse } from '../types/typedResponse';
import ErrorResponse from '../utils/ErrorResponse';

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
      }
    >,
    res: TypedResponse<any>,
    next: NextFunction,
  ) => {
    try {
      const companyId = req.company?._id;
      if (!companyId) {
        return next(new ErrorResponse('Invalid company context', 400));
      }

      const { consultantName, shift, clientName, PNR, ticketNumber, details } = req.body;

      // ✅ Validate required fields
      if (!consultantName || !shift || !clientName || !PNR || !ticketNumber || !details) {
        return next(new ErrorResponse('All fields are required', 400));
      }

      // Optional: verify that the consultant exists in this company
      //   const consultant = await User.findOne({
      //     $or: [
      //       { firstName: consultantName },
      //       { lastName: consultantName },
      //       { email: consultantName },
      //       { staffId: consultantName },
      //     ],
      //     company: companyId,
      //   }).lean();

      //   if (!consultant) {
      //     return next(new ErrorResponse(`Consultant '${consultantName}' not found in company`, 404));
      //   }

      // ✅ Create operation report
      const operation = await OperationReport.create({
        consultantName,
        shift,
        clientName,
        PNR,
        ticketNumber,
        details,
        company: companyId,
        createdAt: new Date(),
      });

      // (Optional) send notification to consultant if needed
      // await sendNotification({
      //   user: consultant,
      //   type: 'INFO',
      //   title: `New Operation Report Created`,
      //   message: `An operation report has been logged for your shift (${shift}).`,
      // });

      res.status(201).json({
        success: true,
        data: operation,
      });
    } catch (err: any) {
      next(new ErrorResponse(err.message || 'Server error', 500));
    }
  },
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
