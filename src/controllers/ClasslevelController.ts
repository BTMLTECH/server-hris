import { Request, Response, NextFunction } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import ErrorResponse from '../utils/ErrorResponse';
import ClassLevel, { IClassLevel } from '../models/ClassLevel';
import { TypedRequest } from '../types/typedRequest';
import { TypedResponse } from '../types/typedResponse';
import { calculatePayroll } from '../utils/payrollCalculator';
import { Types } from 'mongoose';
import { ParsedClassLevel, parseExcelClassLevels, recalcBreakdown } from '../utils/excelParser';


export const calculateClass = asyncHandler(
  async (
    req: TypedRequest<{}, {}, any>,
    res: TypedResponse<any>,
    next: NextFunction
  ) => {
    try {
      const { band } = req.body; 
      if (!band) {
        return next(new ErrorResponse("band is required", 400));
      }
      const basicSalary = band * 0.55;
      const housingAllowance = band * 0.25;
      const transportAllowance = band * 0.20;
      const totalAllowances = housingAllowance + transportAllowance;

      const payrollResult = calculatePayroll({
        basicSalary,
        totalAllowances
      });

      const payload = {
        basicSalary,
        housingAllowance,
        transportAllowance,
        totalAllowances,
        payrollResult
      }

      // return response
      return res.status(200).json({
        success: true,
        data: payload,
      });
    } catch (error) {
      return next(error);
    }
  }
);



export const bulkCreateClassLevels = asyncHandler(
  async (
    req: TypedRequest,
    res: TypedResponse<{
      created: string[];
      errors: string[];
    }>,
    next
  ) => {
    const companyId = req.company?._id as Types.ObjectId;

    if (!companyId) {
      return next(new ErrorResponse("Company ID is required", 400));
    }

    let classLevels: ParsedClassLevel[] = [];

    // Accept file or JSON body
    if (req.file) {
      classLevels = parseExcelClassLevels(req.file.buffer);
    } else if (Array.isArray(req.body)) {
      classLevels = req.body;
    } else {
      return next(
        new ErrorResponse("Invalid input. Expecting an array or an Excel file.", 400)
      );
    }

    const created: string[] = [];
    const errors: string[] = [];

    const requiredFields = ["year", "level", "payGrade", "grossSalary"];

    for (const cl of classLevels) {
      // 🔹 Validate required fields
      let missingField = false;
      for (const field of requiredFields) {
        if ((cl as any)[field] === undefined || (cl as any)[field] === null) {
          errors.push(
            `Missing required field: ${field} (PayGrade: ${cl.payGrade || "UNKNOWN"})`
          );
          missingField = true;
        }
      }
      if (missingField) continue;

      // 🔹 Check if class level already exists
      const existing = await ClassLevel.findOne({
        year: cl.year,
        level: cl.level,
        payGrade: cl.payGrade,
        company: companyId,
      }) as IClassLevel;

      if (existing) {
        errors.push(
          `Duplicate: ${cl.year}-${cl.level}-${cl.payGrade} already exists`
        );
        continue;
      }

      // 🔹 Calculate breakdown
      const { basicSalary, housingAllowance, transportAllowance } =
        recalcBreakdown(cl.grossSalary);

      // 🔹 Create new record
      const newClassLevel = new ClassLevel({
        year: cl.year,
        level: cl.level,
        payGrade: cl.payGrade,
        band: `${cl.year} ${cl.payGrade}`,
        grossSalary: cl.grossSalary,
        basicSalary,
        housingAllowance,
        transportAllowance,
        company: companyId,
      });

      await newClassLevel.save();
      created.push(`${cl.year}-${cl.level}-${cl.payGrade}`);
    }

    res.status(200).json({
      success: true,
      message: "Class levels processed successfully.",
      data: {
        created,
        errors,
      },
    });
  }
);


export const createClassLevel = asyncHandler(async (
  req: TypedRequest<{}, {}, any>,
  res: TypedResponse<any>,
  next: NextFunction
) => {
  const companyId = req.company?._id;
  if (!companyId) {
    return next(new ErrorResponse('Company ID is required', 400));
  }

  const requiredFields = [
    'year',
    'level',
    'payGrade',
    'basicSalary',
    'housingAllowance',
    'transportAllowance'
  ];

  for (const field of requiredFields) {
    if (req.body[field] === undefined || req.body[field] === null) {
      return next(new ErrorResponse(`Missing required field: ${field}`, 400));
    }
  }

  const exists = await ClassLevel.findOne({
    year: req.body.year,
    level: req.body.level,
    payGrade: req.body.payGrade,
    company: companyId
  });

  if (exists) {
    return next(
      new ErrorResponse(
        'ClassLevel already exists for this year and pay grade',
        400
      )
    );
  }

  const created = await ClassLevel.create({
    ...req.body,
    company: companyId
  });

  return res.status(201).json({
    success: true,
    message: 'ClassLevel created successfully',
    data: created
  });
});

export const getAllClassLevels = asyncHandler(async (
  req: TypedRequest<{}, { page?: string; limit?: string; year?: string }>,
  res: TypedResponse<any>, 
  next: NextFunction
) => {
  try {
    const companyId = req.company?._id;
    if (!companyId) {
      return next(new ErrorResponse('Company ID is required', 400));
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 30;
    const skip = (page - 1) * limit;

    const query: any = { company: companyId };
    if (req.query.year) {
      query.year = parseInt(req.query.year);
    }

    const [classLevels, total] = await Promise.all([
      ClassLevel.find(query)
        .sort({ level: 1, payGrade: 1 })
        .skip(skip)
        .limit(limit),
      ClassLevel.countDocuments(query)
    ]);

    const pages = Math.ceil(total / limit);

    res.status(200).json({
      success: true,
      data: {
        data: classLevels,
        pagination: { total, page, limit, pages },
        count: classLevels.length
      }
    });
  } catch (err: any) {
    next(new ErrorResponse(err.message, 500));
  }
});

export const updateClassLevel = asyncHandler(async (
  req: TypedRequest<{ id?: string }, {}, any>,
  res: TypedResponse<any>,
  next: NextFunction
) => {

  const companyId = req.company?._id;
  if (!companyId) {
    return next(new ErrorResponse('Company ID is required', 400));
  }

  const { id } = req.params;

  const classLevel = await ClassLevel.findOne({ _id: id, company: companyId });
  if (!classLevel) {
    return next(new ErrorResponse('ClassLevel not found', 404));
  }

  const allowedUpdates = [
    'level',
    'payGrade',
    'basicSalary',
    'housingAllowance',
    'transportAllowance',
    'lasgAllowance',
    'twentyFourHoursAllowance',
    'healthAllowance',
    'otherAllowance'
  ];

  const updates: any = {};
  for (const key of allowedUpdates) {
    if (req.body[key] !== undefined) {
      updates[key] = req.body[key];
    }
  }

  const updated = await ClassLevel.findByIdAndUpdate(
    id,
    { $set: updates },
    { new: true, runValidators: true }
  );

  return res.status(200).json({
    success: true,
    message: 'ClassLevel updated successfully',
    data: updated
  });
});

export const deleteClassLevel = asyncHandler(async (
  req: TypedRequest<{ id?: string }, {}, any>,
  res: TypedResponse<any>,
  next: NextFunction
) => {
  const companyId = req.company?._id;
  if (!companyId) {
    return next(new ErrorResponse('Company ID is required', 400));
  }

  const { id } = req.params;

  const deleted = await ClassLevel.findOneAndDelete({
    _id: id,
    company: companyId
  });

  if (!deleted) {
    return next(new ErrorResponse('ClassLevel not found', 404));
  }

  return res.status(200).json({
    success: true,
    message: 'ClassLevel deleted successfully'
  });
});



export const bulkDeleteClassLevelsByYear = asyncHandler(
  async (
    req: TypedRequest<{}, {}, { year: number }>,
    res: TypedResponse<{ deleted: number }>,
    next
  ) => {
    const companyId = req.company?._id as Types.ObjectId;
    const { year } = req.body;
    if (!companyId) {
      return next(new ErrorResponse("Company ID is required", 400));
    }

    if (!year) {
      return next(new ErrorResponse("Year is required", 400));
    }

    const result = await ClassLevel.deleteMany({
      year,
      company: companyId,
    });

    res.status(200).json({
      success: true,
      message: `Deleted ${result.deletedCount} class level(s) for year ${year}`,
      data: { deleted: result.deletedCount },
    });
  }
);

