
import AppraisalRequest, { IAppraisalObjective, IAppraisalRequest } from '../models/AppraisalRequest';
import User, { IUser } from '../models/user.model';


import { asyncHandler } from '../middleware/asyncHandler';
import ErrorResponse from '../utils/ErrorResponse';
import { NextFunction } from 'express';
import { TypedRequest } from '../types/typedRequest';
import { TypedResponse } from '../types/typedResponse';
import { logAudit } from '../utils/logAudit';
import { sendNotification } from '../utils/sendNotification';
import { CreateAppraisalDTO, CreateAppraisalResponse, GetAppraisalActivityQuery, GetAppraisalActivityResponse, UpdateAppraisalDto } from '../types/appraisalTypes';
import { Types } from 'mongoose';
import { redisClient } from '../utils/redisClient';


export const createAppraisalRequest = async (
  req: any,
  res: any,
  next: NextFunction
) => {
  try {
    const { title, teamLeadId, period, dueDate, objectives } = req.body;

    if (!title || !teamLeadId || !period || !dueDate || !objectives || objectives.length === 0) {
      return next(new ErrorResponse('All fields including objectives are required', 400));
    }

    const totalScore = objectives.reduce((sum: any, obj: { marks: any; }) => sum + (obj.marks || 0), 0);
    if (totalScore !== 100) {
      return next(new ErrorResponse('Total appraisal score must equal 100 marks', 400));
    }

    const teamleadUser = await User.findById(teamLeadId);
    if (!teamleadUser || !teamleadUser.department) {
      return next(new ErrorResponse('Team lead or department not found', 404));
    }

    const employees = await User.find({
      department: teamleadUser.department,
      role: 'employee',
    });

    if (employees.length === 0) {
      return next(new ErrorResponse('No employees found in the department', 404));
    }

    const appraisalRequests = await Promise.all(
      employees.map(async (employee) => {
        const appraisal = await AppraisalRequest.create({
          title,
          user: employee._id,
          teamLeadId,
          department: teamleadUser.department,
          period,
          dueDate,
          objectives: objectives.map((obj: any) => ({
            ...obj,
            employeeScore: 0,
            teamLeadScore: 0,
            finalScore: 0,
            employeeComments: '',
            teamLeadComments: '',
            evidence: '',
          })),
          totalScore: { employee: 0, teamLead: 0, final: 0 },
          status: 'pending',
          reviewLevel: 'teamlead',
          reviewTrail: [],
          typeIdentify: 'appraisal',
        });

        await sendNotification({
          user: employee,
          type: 'NEW_APPRAISAL',
          title: 'New Appraisal Assigned',
          message: `A new appraisal titled "${title}" has been assigned to you. Please review and respond.`,
          emailSubject: 'New Appraisal Assigned',
          emailTemplate: 'appraisal-assigned.ejs',
          emailData: {
            name: employee.firstName,
            title,
            period,
            dueDate,
          },
        });

        return appraisal;
      })
    );

    await logAudit({
      userId: req.user?.id,
      action: 'CREATE_APPRAISAL_REQUEST',
      status: 'SUCCESS',
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.status(201).json({
      success: true,
      message: `${appraisalRequests.length} appraisal(s) created successfully`,
      data: appraisalRequests,
    });
  } catch (error: any) {
    next(new ErrorResponse(error.message, 500));
  }
};




export const updateAppraisalRequest = asyncHandler(
  async (
    req: TypedRequest<{ id?: string }, {}, UpdateAppraisalDto>,
    res: TypedResponse<IAppraisalRequest>,
    next: NextFunction
  ) => {
    try {
      const { id } = req.params;
      const updateData = req.body;
      const role = req.user?.role;

      const appraisal = await AppraisalRequest.findById(id);
      if (!appraisal) {
        return next(new ErrorResponse("Appraisal not found", 404));
      }

      if (updateData.status === "update") delete updateData.status;

      if (updateData.objectives) {
        const total = updateData.objectives.reduce((sum, obj) => sum + (obj.marks || 0), 0);
        if (total !== 100) {
          return next(new ErrorResponse("Total appraisal score must equal 100 marks", 400));
        }

        // Role-specific objective updates
        appraisal.objectives = appraisal.objectives.map((existingObj) => {
          const updatedObj = updateData.objectives?.find((o) => o.id === existingObj.id);
          if (!updatedObj) return existingObj;

          switch (role) {
            case "employee":
              return {
                ...existingObj,
                employeeScore: updatedObj.employeeScore ?? existingObj.employeeScore,
                employeeComments: updatedObj.employeeComments ?? existingObj.employeeComments,
              };
            case "teamlead":
              return {
                ...existingObj,
                teamLeadScore: updatedObj.teamLeadScore ?? existingObj.teamLeadScore,
                teamLeadComments: updatedObj.teamLeadComments ?? existingObj.teamLeadComments,
              };
            default:
              return existingObj;
          }
        });
      }

      // --- Update other fields ---
      if (updateData.title) appraisal.title = updateData.title;
      if (updateData.period) appraisal.period = updateData.period;
      if (updateData.dueDate) appraisal.dueDate = updateData.dueDate;

      const allowedStatuses: IAppraisalRequest["status"][] = [
        "pending",
        "submitted",
        "needs_revision",
        "sent_to_employee",
      ];
      if (updateData.status && allowedStatuses.includes(updateData.status)) {
        appraisal.status = updateData.status;
      }

      if (updateData.revisionReason) {
        appraisal.revisionReason = updateData.revisionReason;
      }

      // --- Recalculate Totals (mirrors frontend) ---
      appraisal.totalScore.employee = appraisal.objectives.reduce(
        (sum, obj) => sum + (obj.employeeScore || 0),
        0
      );
      appraisal.totalScore.teamLead = appraisal.objectives.reduce(
        (sum, obj) => sum + (obj.teamLeadScore || 0),
        0
      );

      if (role === "teamlead") {
        appraisal.totalScore.final = appraisal.totalScore.teamLead;
      } else if (role === "hr") {
        const hrAdjustmentsMap = {
          innovation: 3,
          commendation: 3,
          query: -4,
          majorError: -15,
        };

        appraisal.hrAdjustments = {
          innovation: !!updateData.hrAdjustments?.innovation,
          commendation: !!updateData.hrAdjustments?.commendation,
          query: !!updateData.hrAdjustments?.query,
          majorError: !!updateData.hrAdjustments?.majorError,
        };

        let finalTotal = appraisal.totalScore.teamLead;
        Object.keys(appraisal.hrAdjustments).forEach((key) => {
          if (appraisal.hrAdjustments![key as keyof typeof appraisal.hrAdjustments]) {
            finalTotal += hrAdjustmentsMap[key as keyof typeof hrAdjustmentsMap];
          }
        });
        appraisal.totalScore.final = finalTotal;
      } else {
        appraisal.totalScore.final = appraisal.totalScore.final || 0;
      }

      await appraisal.save();

      res.status(200).json({
        success: true,
        message: "Appraisal updated successfully",
        data: appraisal,
      });
    } catch (error: any) {
      next(new ErrorResponse(error.message, 500));
    }
  }
);


export const getAppraisalActivity = asyncHandler(
  async (
    req: TypedRequest<{}, GetAppraisalActivityQuery, {}>,
    res: any,
    next: NextFunction
  ) => {
    try {
      const user = req.user;
      if (!user) {
        return next(new ErrorResponse("User not authenticated", 401));
      }

      const page = parseInt(req.query.page || "1");
      let limit = parseInt(req.query.limit || "10");
      if (limit > 50) limit = 50;
      const skip = (page - 1) * limit;

      let query: any = {};

      // Role-based query filter
      if (user.role === "admin") {
        query = {}; // Full access
      } else if (user.role === "hr") {
        query = {
          reviewLevel: "hr",
          status: { $in: ["submitted", "needs_revision"] },
          reviewTrail: { $elemMatch: { role: "teamlead", action: "approved" } },
          $nor: [{ reviewTrail: { $elemMatch: { role: "hr" } } }],
        };
      } else if (user.role === "teamlead") {
        query = { teamLeadId: user._id };
      } else if (user.role === "employee") {
        query = { user: user._id };
      }

      // Status filter from query string
      const statusFilter = req.query.status;
      if (statusFilter && statusFilter !== "all") {
        query.status = statusFilter;
      }

      const total = await AppraisalRequest.countDocuments(query);
      const appraisals = await AppraisalRequest.find(query)
        .populate("user", "firstName lastName email")
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit);

      res.status(200).json({
        success: true,
        message: "Appraisal activity fetched successfully",
        data: appraisals,
        pagination: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit),
        },
      });
    } catch (error: any) {
      next(new ErrorResponse(error.message, 500));
    }
  }
);





export const approveAppraisalRequest = asyncHandler (async (
  req: TypedRequest<{ id?: string }, {}, IAppraisalRequest>,
  res: any,
  next: NextFunction
) => {
  try {
      const appraisalId = req.params.id;

      const reviewer = req.user!;
      const reviewerId = reviewer._id as Types.ObjectId;

    const appraisal = await AppraisalRequest.findById(appraisalId).populate<{user: IUser}>("user");

    if (!appraisal)
      return next(new ErrorResponse("Appraisal not found", 404));

    if (!["submitted", "needs_revision"].includes(appraisal.status!)) {
      return next(new ErrorResponse("Appraisal already reviewed", 400));
    }

    const roleMap = {
      teamlead: "teamlead",
      hr: "hr",
    };

    if (roleMap[appraisal.reviewLevel] !== reviewer.role) {
      return next(
        new ErrorResponse("Not authorized to review this appraisal", 403)
      );
    }

    appraisal.reviewTrail.push({
      reviewer: reviewerId,
      role: reviewer.role,
      action: "approved",
      date: new Date(),
    });

    if (appraisal.reviewLevel === "teamlead") {
      appraisal.reviewLevel = "hr";
    } else if (appraisal.reviewLevel === "hr") {
      appraisal.status = "approved";
    }

    await appraisal.save();

    if (appraisal.status === "approved") {
      await sendNotification({
        user: appraisal.user,
        type: "APPRAISAL_APPROVED",
        title: "Appraisal Approved",
        message: `Your appraisal "${appraisal.title}" has been fully approved.`,
        emailSubject: "Appraisal Approved",
        emailTemplate: "appraisal-approved.ejs",
        emailData: {
          name: appraisal.user.firstName,
          title: appraisal.title,
        },
      });
    }

    await logAudit({
      userId: reviewer._id,
      action: "APPROVE_APPRAISAL",
      status: "SUCCESS",
      ip: req.ip,
      userAgent: req.get("user-agent"),
    });

    res
      .status(200)
      .json({ success: true, message: "Appraisal approved", data: { data: appraisal } });
  } catch (error: any) {
    next(new ErrorResponse(error.message, 500));
  }
});



export const rejectAppraisalRequest = asyncHandler(async (
  req: TypedRequest<{ id?: string }, {}, IAppraisalRequest>,
  res: any,
  next: NextFunction
) => {
  try {
    const appraisalId = req.params.id;

    const reviewer = req.user!;
    const reviewerId = reviewer._id as Types.ObjectId;

    const appraisal = await AppraisalRequest.findById(appraisalId).populate<{ user: IUser }>("user");

    if (!appraisal)
      return next(new ErrorResponse("Appraisal not found", 404));

    if (!["submitted", "needs_revision"].includes(appraisal.status!)) {
      return next(new ErrorResponse("Appraisal already reviewed", 400));
    }

    const roleMap = {
      teamlead: "teamlead",
      hr: "hr",
    };

    if (roleMap[appraisal.reviewLevel] !== reviewer.role) {
      return next(
        new ErrorResponse("Not authorized to review this appraisal", 403)
      );
    }

    appraisal.status = "rejected";
    appraisal.reviewTrail.push({
      reviewer: reviewerId,
      role: reviewer.role,
      action: "rejected",
      date: new Date(),
    });

    await appraisal.save();

    await sendNotification({
      user: appraisal.user,
      type: "APPRAISAL_REJECTED",
      title: "Appraisal Rejected",
      message: `Your appraisal "${appraisal.title}" has been rejected`,
      emailSubject: "Appraisal Rejected",
      emailTemplate: "appraisal-rejected.ejs",
      emailData: {
        name: appraisal.user.firstName,
        title: appraisal.title,
      },
    });

    await logAudit({
      userId: reviewer._id,
      action: "REJECT_APPRAISAL",
      status: "SUCCESS",
      ip: req.ip,
      userAgent: req.get("user-agent"),
    });

    res
      .status(200)
      .json({ success: true, message: "Appraisal rejected", data: { data: appraisal } });
  } catch (error: any) {
    next(new ErrorResponse(error.message, 500));
  }
});


export const getAppraisalApprovalQueue = asyncHandler(async (
  req: TypedRequest<{}, {}, {}>,
  res: any,
  next: NextFunction
) => {
  try {
    const role = req.user?.role;
    const userId = req.user?._id;

    let filter: any = { status: "pending" };

    if (role === "teamlead") {
      filter.reviewLevel = "teamlead";
      filter.teamLead = userId;
    } else if (role === "hr") {
      filter.reviewLevel = "hr";
    } else {
      res.status(200).json({ success: true, data: { data: [] } });
      return;
    }

    const appraisals = await AppraisalRequest.find(filter)
      .populate("employee", "firstName lastName email")
      .sort({ createdAt: -1 });

    res
      .status(200)
      .json({ success: true, data: { data: appraisals } });
  } catch (error: any) {
    next(new ErrorResponse(error.message, 500));
  }
});

export const getEmployeesByTeamLeadDepartment = asyncHandler(async (
  req: TypedRequest<{}, {}, {}>,
  res: any,
  next: NextFunction
) => {
  try {
    const teamleadId = req.user?._id;
    const cacheKey = `employees:${teamleadId}`;

    const cachedEmployees = await redisClient.get(cacheKey);
    if (cachedEmployees) {
      return res.status(200).json({
        success: true,
        message: "Employees in your department (cached)",
        data: JSON.parse(cachedEmployees),
      });
    }

    // Step 2: Find teamlead's department
    const teamlead = await User.findById(teamleadId).select("department company role");

    if (!teamlead || teamlead.role !== "teamlead") {
      return next(new ErrorResponse("TeamLead not found or not authorized", 404));
    }

    // Step 3: Get all employees in the same department as the teamlead
    const employees = await User.find({
      department: teamlead.department,
      role: "employee",
      company: teamlead.company,
    }).select("firstName lastName email department status");

    // Cache the employees' data with a 1-hour expiration (3600 seconds)
    await redisClient.setex(cacheKey, 3600, JSON.stringify(employees));

    res.status(200).json({
      success: true,
      message: "Employees in your department",
      data: { data: employees },
    });
  } catch (error: any) {
    next(new ErrorResponse(error.message, 500));
  }
});
