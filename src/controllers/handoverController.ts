import { sendNotification } from '../utils/sendNotification';
import { logAudit } from '../utils/logAudit';
import { NextFunction } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { TypedRequest } from '../types/typedRequest';
import { TypedResponse } from '../types/typedResponse';
import HandoverReport, { IHandoverReport } from '../models/HandoverReport';
import User from '../models/user.model';
import { CreateHandoverDTO } from '../types/handoverType';
import { uploadToCloudinary } from '../utils/cloudinary';
import ErrorResponse from '../utils/ErrorResponse';
import { redisClient } from '../utils/redisClient';
import userModel from '../models/user.model';

export const createHandoverReport = asyncHandler(
  async (
    req: TypedRequest<{}, {}, CreateHandoverDTO>,
    res: TypedResponse<{ data: IHandoverReport }>,
    next: NextFunction,
  ) => {
    const { date, shift, summary, teamlead } = req.body;
    const userId = req.user?._id;

    if (!date || !shift || !summary || !teamlead || !req.file) {
      return next(new ErrorResponse('All fields including PDF file are required.', 403));
    }

    const pdfResult = await uploadToCloudinary(
      req.file.buffer,
      'btm/documents',
      'auto',
      'btmlimited',
    );

    if (!pdfResult) {
      return next(new ErrorResponse('Failed to upload PDF file.', 403));
    }

    const company = req.company;
    const pdfUrl = pdfResult.secure_url;

    const handover = await HandoverReport.create({
      user: userId,
      teamlead,
      date,
      shift,
      summary,
      pdfFile: pdfUrl,
      employeename: `${req.user?.firstName} ${req.user?.lastName}`,
      status: 'submitted',
    });

    const teamleadUser = await User.findById(teamlead);

    if (teamleadUser) {
      await sendNotification({
        user: teamleadUser,
        type: 'NEW_HANDOVER',
        title: 'New Handover Report Submitted',
        message: `${req.user?.firstName} submitted a handover report for ${date}.`,
        emailSubject: 'New Handover Report to Review',
        emailTemplate: 'handover-review-request.ejs',
        emailData: {
          companyName: company?.branding?.displayName || company?.name,
          logoUrl: company?.branding?.logoUrl,
          primaryColor: company?.branding?.primaryColor || '#0621b6b0',
        },
      });
    }

    await logAudit({
      userId,
      action: 'CREATE_HANDOVER_REPORT',
      status: 'SUCCESS',
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.status(201).json({
      success: true,
      message: 'Handover report submitted',
      data: { data: handover },
    });
  },
);

export const getMyHandovers = asyncHandler(
  async (
    req: TypedRequest,
    res: TypedResponse<{ data: IHandoverReport[] }>,
    _next: NextFunction,
  ) => {
    const userId = req.user?._id;

    const handovers = await HandoverReport.find({ user: userId }).sort({
      createdAt: -1,
    });

    res.status(200).json({
      success: true,
      message: 'Fetched current user handovers',
      data: { data: handovers },
    });
  },
);

export const getTeamLeadByEmployeeDepartment = asyncHandler(
  async (req: TypedRequest, res: any, next: NextFunction) => {
    const employeeId = req.user?._id;

    // Step 1: Check cache
    const cacheKey = `teamlead:${employeeId}`;
    const cachedTeamlead = await redisClient.get(cacheKey);
    if (cachedTeamlead) {
      return res.status(200).json({
        success: true,
        message: 'Teamlead of your department (cached)',
        data: JSON.parse(cachedTeamlead),
      });
    }

    // Step 2: Find employee's department
    const employee = await userModel.findById(employeeId).select('department company');
    if (!employee) {
      return next(new ErrorResponse('Employee not found', 404));
    }

    // Step 3: Get teamlead in the same department
    const teamlead = await userModel
      .findOne({
        department: employee.department,
        role: 'teamlead',
        company: employee.company,
      })
      .select('firstName lastName email department company');

    if (!teamlead) {
      return next(new ErrorResponse('Teamlead not found for this department', 404));
    }

    // Cache the result for 1 hour
    await redisClient.setex(cacheKey, 3600, JSON.stringify(teamlead));

    res.status(200).json({
      success: true,
      message: 'Teamlead of your department',
      data: { data: teamlead },
    });
  },
);

export const deleteHandoverById = async (
  req: TypedRequest<{ id: string }>,
  res: TypedResponse<{ message: string }>,
  next: NextFunction,
): Promise<void> => {
  try {
    const handoverId = req.params.id;
    const companyId = req.company?._id;

    if (!companyId) {
      return next(new ErrorResponse('Company context is missing', 400));
    }

    const handover = await HandoverReport.findOne({
      _id: handoverId,
      company: companyId,
    });

    if (!handover) {
      return next(new ErrorResponse('Handover report not found', 404));
    }

    await handover.deleteOne();

    await logAudit({
      userId: req.user?._id,
      action: 'DELETE_HANDOVER_REPORT',
      status: 'SUCCESS',
      ip: req.ip,
      userAgent: req.get('user-agent') || '',
    });

    res.status(200).json({
      success: true,
      message: 'Handover report deleted successfully',
    });
  } catch (err) {
    next(err);
  }
};
