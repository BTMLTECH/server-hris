
import AppraisalRequest, { AppraisalReviewLevel, IAppraisalRequest } from '../models/AppraisalRequest';
import User, { IUser } from '../models/user.model';


import { asyncHandler } from '../middleware/asyncHandler';
import ErrorResponse from '../utils/ErrorResponse';
import { NextFunction } from 'express';
import { TypedRequest } from '../types/typedRequest';
import { TypedResponse } from '../types/typedResponse';
import { logAudit } from '../utils/logAudit';
import { sendNotification } from '../utils/sendNotification';
import { CreateAppraisalDTO, CreateAppraisalResponse } from '../types/appraisalTypes';
import { Types } from 'mongoose';

// Create Appraisal
export const createAppraisalRequest = asyncHandler(
  async (
    req: TypedRequest<{}, {}, CreateAppraisalDTO>,
    res: TypedResponse<IAppraisalRequest>,
    next: NextFunction
  ) => {
    try {
      const { title, employee, teamLead, period, dueDate, targets } = req.body;

      if (!title || !employee || !teamLead || !period || !dueDate || !targets || targets.length === 0) {
        return next(new ErrorResponse('All fields including targets are required', 400));
      }

      const totalScore = targets.reduce((sum: any, t: { mark: any; }) => sum + (t.mark || 0), 0);
      if (totalScore !== 100) {
        return next(new ErrorResponse('Total appraisal score must equal 100 marks', 400));
      }

      const appraisal = await AppraisalRequest.create({
        title,
         user: employee,
        teamLead,
        period,
        dueDate,
        targets,
        status: 'Pending',
        reviewLevel: 'TeamLead',
        reviewTrail: [],
      });

      const employeeUser = await User.findById(employee);
      if (employeeUser) {
        await sendNotification({
          user: employeeUser,
          type: 'NEW_APPRAISAL',
          title: 'New Appraisal Assigned',
          message: `A new appraisal titled "${title}" has been assigned to you. Please review and respond.`,
          emailSubject: 'New Appraisal Assigned',
          emailTemplate: 'appraisal-assigned.ejs',
          emailData: {
            name: employeeUser.firstName,
            title,
            period,
            dueDate
          },
        });
      }

      await logAudit({
        userId: req.user?.id,
        action: 'CREATE_APPRAISAL_REQUEST',
        status: 'SUCCESS',
        ip: req.ip,
        userAgent: req.get('user-agent'),
      });

      res.status(201).json({
        success: true,
        message: 'Appraisal created successfully',
        data: appraisal
      });

    } catch (error: any) {
      next(new ErrorResponse(error.message, 500));
    }
  }
);

// Approve Appraisal
export const approveAppraisalRequest = 
  async (
    req: TypedRequest<{ id: string }, {}, CreateAppraisalDTO>,
    res: TypedResponse<CreateAppraisalResponse>,
    next: NextFunction
  ) => {
    try {
      const appraisalId = req.params.id;
      const reviewer = req.user!;
      const reviewerId = reviewer._id as Types.ObjectId;
      

      const appraisal = await AppraisalRequest.findById(appraisalId).populate<{user: IUser}>('user', 'firstName lastName email');
      if (!appraisal) return next(new ErrorResponse('Appraisal not found', 404));
      if (appraisal.status !== 'Pending') return next(new ErrorResponse('Appraisal already reviewed', 400));

  


    const roleMap: Record<AppraisalReviewLevel, string> = {
      teamlead: 'teamlead',
      hr: 'hr',
      md: 'md',
    };


      if (roleMap[appraisal.reviewLevel] !== reviewer.role) {
        return next(new ErrorResponse('Not authorized to review this appraisal', 403));
      }

      appraisal.reviewTrail.push({
        reviewer: reviewerId,
        role: reviewer.role,
        action: 'Approved',
        date: new Date(),
      });

      if (appraisal.reviewLevel === 'teamlead') {
        appraisal.reviewLevel = 'hr';
      } else if (appraisal.reviewLevel === 'hr') {
        appraisal.reviewLevel = 'md';
      } else if (appraisal.reviewLevel === 'md') {
        appraisal.status = 'Approved';
      }

      await appraisal.save();

      if (appraisal.status === 'Approved') {
        await sendNotification({
          user: appraisal.user,
          type: 'APPRAISAL_APPROVED',
          title: 'Appraisal Approved',
          message: `Your appraisal "${appraisal.title}" has been fully approved.`,
          emailSubject: 'Appraisal Approved',
          emailTemplate: 'appraisal-approved.ejs',
          emailData: {
            name: appraisal.user.firstName,
            title: appraisal.title
          },
        });
      }

      await logAudit({
        userId: reviewer._id,
        action: 'APPROVE_APPRAISAL',
        status: 'SUCCESS',
        ip: req.ip,
        userAgent: req.get('user-agent'),
      });

      res.status(200).json({ success: true, message: 'Appraisal approved', data: { data: appraisal} });

    } catch (error: any) {
      next(new ErrorResponse(error.message, 500));
    }
  };

// Reject Appraisal
export const rejectAppraisalRequest = 
  async (
    req: TypedRequest<{ id: string }, {}, { note: string }>,
    res: TypedResponse<CreateAppraisalResponse>,
    next: NextFunction
  ) => {
    try {
      const appraisalId = req.params.id;
      const { note } = req.body;
      const reviewer = req.user!;
      const reviewerId = reviewer._id as Types.ObjectId;


      const appraisal = await AppraisalRequest.findById(appraisalId).populate<{user: IUser}>('employee');
      if (!appraisal) return next(new ErrorResponse('Appraisal not found', 404));
      if (appraisal.status !== 'Pending') return next(new ErrorResponse('Appraisal already reviewed', 400));



      const roleMap: Record<AppraisalReviewLevel, string> = {
       teamlead: 'teamlead',
        hr: 'hr',
        md: 'md',
      };


      if (roleMap[appraisal.reviewLevel] !== reviewer.role) {
        return next(new ErrorResponse('Not authorized to review this appraisal', 403));
      }

      appraisal.status = 'Rejected';
      appraisal.reviewTrail.push({
        reviewer: reviewerId,
        role: reviewer.role,
        action: 'Rejected',
        date: new Date(),
        note,
      });

      await appraisal.save();

      await sendNotification({
        user: appraisal.user,
        type: 'APPRAISAL_REJECTED',
        title: 'Appraisal Rejected',
        message: `Your appraisal "${appraisal.title}" has been rejected. Reason: ${note}`,
        emailSubject: 'Appraisal Rejected',
        emailTemplate: 'appraisal-rejected.ejs',
        emailData: {
          name: appraisal.user.firstName,
          title: appraisal.title,
          note,
        },
      });

      await logAudit({
        userId: reviewer._id,
        action: 'REJECT_APPRAISAL',
        status: 'SUCCESS',
        ip: req.ip,
        userAgent: req.get('user-agent'),
      });

      res.status(200).json({
        success: true,
        message: 'Appraisal rejected',
        data: { data: appraisal },
      });

    } catch (error: any) {
      next(new ErrorResponse(error.message, 500));
    }
  };

// Get Appraisal Queue
export const getAppraisalApprovalQueue = asyncHandler(
  async (
    req: TypedRequest,
    res: TypedResponse<{ data: any[] }>,
    next: NextFunction
  ) => {
    try {
      const role = req.user?.role;
      const userId = req.user?._id;

      let filter: any = { status: 'pending' };

    if (role === 'teamlead') {
      filter.reviewLevel = 'teamlead';
      filter.teamLead = userId;
    }  else if (role === 'hr') {
      filter.reviewLevel = 'hr';
    } else if (role === 'md') {
      filter.reviewLevel = 'md';
    } else {
      res.status(200).json({ success: true, data: { data: [] } });
      return;
    }

      const appraisals = await AppraisalRequest.find(filter)
        .populate('employee', 'firstName lastName email')
        .sort({ createdAt: -1 });

      res.status(200).json({ success: true, data: { data: appraisals } });

    } catch (error: any) {
      next(new ErrorResponse(error.message, 500));
    }
  }
);
