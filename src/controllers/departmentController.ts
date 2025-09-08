

import { NextFunction} from 'express';

import Department from '../models/department.model';
import { asyncHandler } from '../middleware/asyncHandler';
import ErrorResponse from '../utils/ErrorResponse';
import { TypedRequest } from '../types/typedRequest';
import { TypedResponse } from '../types/typedResponse';


export const bulkCreateDepartments = asyncHandler(async (
  req: TypedRequest<{id?: string }, {}, any>, 
  res: TypedResponse<any>,
   next: NextFunction

) => {
  const companyId = req.company?._id
  const { departments } = req.body;

  if (!companyId) {
    return next(new ErrorResponse('Company ID is required', 400));
  }

  if (!Array.isArray(departments) || departments.length === 0) {
    return next(new ErrorResponse('Please provide an array of departments', 400));
  }

  for (const dept of departments) {
    if (!dept.name) {
      return next(new ErrorResponse('Each department must have a name', 400));
    }
  }

  const names = departments.map(d => d.name.trim());
  const existing = await Department.find({ name: { $in: names }, company: companyId });
  const existingNames = existing.map(e => e.name);

  const filtered = departments
    .filter(dept => !existingNames.includes(dept.name.trim()))
    .map(dept => ({ ...dept, company: companyId })); // ✅ Attach companyId here

  if (filtered.length === 0) {
    return next(new ErrorResponse('All provided departments already exist', 400));
  }

  const inserted = await Department.insertMany(filtered);

  return res.status(201).json({
    success: true,
    message: 'Departments created successfully',
    data: inserted
  });
});

export const getAllDepartments = asyncHandler(async (
  req: TypedRequest<{}, { page?: string; limit?: string }>,
  res: TypedResponse<any>, 
  next: NextFunction
) => {
  try {
    const companyId = req.company?._id;

    if (!companyId) {
      return next(new ErrorResponse('Invalid company context', 400));
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const companyQuery = [
      { company: companyId },
      { company: companyId.toString() }
    ];

    const [departments, total] = await Promise.all([
      Department.find({ $or: companyQuery })
        .sort({ name: 1 })
        .skip(skip)
        .limit(limit),
      Department.countDocuments({ $or: companyQuery })
    ]);

    const pages = Math.ceil(total / limit);

    if (departments.length === 0) {
    }

    res.status(200).json({
      success: true,
      data: {
        data: departments,
        pagination: { total, page, limit, pages },
        count: departments.length
      }
    });
  } catch (err: any) {
    next(new ErrorResponse(err.message, 500));
  }
});

export const updateDepartment = asyncHandler(async (
  req: TypedRequest<{ id?: string }, {}, any>,
  res: TypedResponse<any>,
  next: NextFunction
) => {
  const { id } = req.params;
  const companyId = req.company?._id;

  const department = await Department.findOne({ _id: id, company: companyId });
  if (!department) {
    return next(new ErrorResponse('Department not found for this company', 404));
  }

  const allowedUpdates = ['name', 'supervisor', 'sopDocument'];
  const updates: Record<string, any> = {};

  for (const key of allowedUpdates) {
    if (req.body[key] !== undefined) {
      updates[key] = req.body[key];
    }
  }

  const updated = await Department.findOneAndUpdate(
    { _id: id, company: companyId },
    { $set: updates },
    { new: true, runValidators: true }
  );

  return res.status(200).json({
    success: true,
    message: 'Department updated successfully',
    data: updated
  });
});
