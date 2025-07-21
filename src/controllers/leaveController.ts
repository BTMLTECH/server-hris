import { NextFunction } from 'express';
import { Types } from 'mongoose';
import { asyncHandler } from '../middleware/asyncHandler';
import LeaveRequest, { ILeaveRequest, ReviewLevel } from '../models/LeaveRequest';
import User, { IUser } from '../models/user.model';
import { ApproveLeaveRequest, CreateLeaveDTO, CreateLeaveResponse, GetLeaveActivityFeedDTO, LeaveActivityFeedItem, LeaveActivityFeedResponse, PopulatedLeaveRequest } from '../types/leaveType';
import { TypedRequest } from '../types/typedRequest';
import { TypedResponse } from '../types/typedResponse';
import ErrorResponse from '../utils/ErrorResponse';
import { calculateWorkingDays } from '../utils/calculateWorkingDays';
import { logAudit } from '../utils/logAudit';
import { sendNotification } from '../utils/sendNotification';
import { redisClient } from '../utils/redisClient';


export const createLeaveRequest = asyncHandler(async (
  req: TypedRequest<{}, {}, CreateLeaveDTO>,
  res: TypedResponse<CreateLeaveResponse>,
  next: NextFunction
) => {
  try {
    const { type, startDate, endDate, days,  reason, teamleadId } = req.body;
    const userId = req.user?.id;
    const company = req.company;
    
    if (!type || !startDate || !endDate || !reason || !teamleadId || !days) {
      return next(new ErrorResponse('All fields are required', 400));
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (end < start) {
      return next(new ErrorResponse('Invalid date range', 400));
    }

    // const days = calculateWorkingDays(start, end);

    const leave = await LeaveRequest.create({
      user: userId,
      teamlead:teamleadId,
      type,
      startDate: start,
      endDate: end,
      days,
      reason,
      status: 'Pending',
      reviewLevel: 'teamlead',
      reviewTrail: [],  // ✅ No trail yet—first action comes from first reviewer
    });

    // Notify applicant (Employee)
    await sendNotification({
      user: req.user!,
      type: 'INFO',
      title: 'Leave Request Submitted',
      message: `You submitted a ${type} leave request for ${days} working day(s). Status: Pending for Approval.`,
      emailSubject: 'Leave Request Submitted',
      emailTemplate: 'leave-request-submitted.ejs',
      emailData: {
        name: req.user?.firstName,
        type,
        startDate,
        days,
        endDate,
        companyName: company?.branding?.displayName || company?.name,
        logoUrl: company?.branding?.logoUrl ,
        primaryColor: company?.branding?.primaryColor || "#0621b6b0",
      },
    });
    
    // Notify Team Lead (first approver)
    const lead = await User.findById(teamleadId);
    if (lead) {
      await sendNotification({
        user: lead,
        type: 'NEW_LEAVE_REQUEST',
        title: 'New Leave Request',
        message: `${req.user?.firstName} submitted a ${type} leave from ${startDate} to ${endDate}.`,
        emailSubject: 'New Leave Request to Review',
        emailTemplate: 'leave-review-request.ejs',
        emailData: {
          reviewerName: lead.firstName,
          employeeName: req.user?.firstName,
          type,
          startDate,
          endDate,
          days,
          companyName: company?.branding?.displayName || company?.name,
          logoUrl: company?.branding?.logoUrl ,
          primaryColor: company?.branding?.primaryColor || "#0621b6b0",
        },
      });
    }

    await logAudit({
      userId,
      action: 'CREATE_LEAVE_REQUEST',
      status: 'SUCCESS',
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.status(201).json({
      success: true,
      message: 'Leave request submitted',
      data: { data: leave },
    });

  } catch (err) {
    next(err);
  }
});


export const approveLeaveRequest = async (
  req: TypedRequest<{ id: string }, {}, CreateLeaveDTO>,
  res: TypedResponse<ApproveLeaveRequest>,
  next: NextFunction
) => {
  try {
    const leaveId = req.params.id;
    const reviewer = req.user!;
    const reviewerRole = reviewer.role;
    const reviewerId = reviewer._id as Types.ObjectId;
    const company = req.company;

    const leave = await LeaveRequest.findById(leaveId).populate<{ user: IUser }>('user');

  
    if (!leave) return next(new ErrorResponse('Leave not found', 404));
    if (leave.status !== 'Pending') return next(new ErrorResponse('Leave already reviewed', 400));

    const currentLevel = leave.reviewLevel;
    
    // Strict role validation ✅
    const levelRoleMap: Record<ReviewLevel, string> = {
      teamlead: 'teamlead',
      hr: 'hr',
      md: 'md',
    };

    if (levelRoleMap[currentLevel] !== reviewerRole) {
      return next(new ErrorResponse('You are not authorized to review this leave at this stage', 403));
    }

    // Approve step
    leave.reviewTrail.push({
      reviewer: reviewerId,
      role: reviewerRole,
      action: 'Approved',
      date: new Date(),
    });

    // Move to next review level or finalize
    if (currentLevel === 'teamlead') {
      leave.reviewLevel = 'hr';
    } else if (currentLevel === 'hr') {
      leave.reviewLevel = 'md';
    } else if (currentLevel === 'md') {
      leave.status = 'Approved';
    }
    // if (currentLevel === 'TeamLead') {
    //   leave.reviewLevel = 'HOD';
    // } else if (currentLevel === 'HOD') {
    //   leave.reviewLevel = 'HR';
    // } else if (currentLevel === 'HR') {
    //   leave.reviewLevel = 'Manager';
    // } else if (currentLevel === 'Manager') {
    //   leave.status = 'Approved';
    // }

    await leave.save();

    // Notify next approver or employee
    if (leave.status === 'Approved') {
      await sendNotification({
        user: leave.user,
        type: 'LEAVE_APPROVED',
        title: 'Leave Approved ✅',
        message: `Your ${leave.type} leave has been fully approved.`,
        emailSubject: 'Leave Approved',
        emailTemplate: 'leave-approved.ejs',
        emailData: {
          name: leave.user.firstName,
          type: leave.type,
          startDate: leave.startDate,
          endDate: leave.endDate,
          days: leave.days,
          companyName: company?.branding?.displayName || company?.name,
          logoUrl: company?.branding?.logoUrl ,
          primaryColor: company?.branding?.primaryColor || "#0621b6b0",
        },
      });
    } else {
      const nextRole = leave.reviewLevel;
      const nextReviewer = await User.findOne({
        role: nextRole,
        department: reviewer.department,
        company: reviewer.company,
      });

      if (nextReviewer) {
        await sendNotification({
          user: nextReviewer,
          type: 'LEAVE_AWAITING_REVIEW',
          title: 'Leave Awaiting Review',
          message: `${leave.user.firstName}'s ${leave.type} leave is pending your review.`,
          emailSubject: 'Leave Approval Needed',
          emailTemplate: 'leave-review-request.ejs',
          emailData: {
            reviewerName: nextReviewer.firstName,
            employeeName: leave.user.firstName,
            type: leave.type,
            startDate: leave.startDate,
            endDate: leave.endDate,
            days: leave.days,
            companyName: company?.branding?.displayName || company?.name,
            logoUrl: company?.branding?.logoUrl ,
            primaryColor: company?.branding?.primaryColor || "#0621b6b0",
          },
        });
      }
    }

    await logAudit({
      userId: reviewerId,
      action: 'APPROVE_LEAVE_REQUEST',
      status: 'SUCCESS',
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.status(200).json({ success: true, message: 'Leave approved', data: { data: leave } });
  } catch (err: any) {
    next(new ErrorResponse(err.message, 500));
  }
};

export const rejectLeaveRequest = async (
  req: TypedRequest<{id: string }, {}, CreateLeaveDTO>, res: TypedResponse<ApproveLeaveRequest>, next: NextFunction

) => {
  try {
    const leaveId = req.params.id;
    const { note } = req.body;
    const reviewer = req.user!;
    const reviewerRole = reviewer.role;
    const reviewerId = reviewer._id as Types.ObjectId;
    const company = req.company;

    const leave = await LeaveRequest.findById(leaveId).populate<{ user: IUser }>('user');

    if (!leave) return next(new ErrorResponse('Leave not found', 404));
    if (leave.status !== 'Pending') return next(new ErrorResponse('Leave already reviewed', 400));

    const currentLevel = leave.reviewLevel;

    // ✅ Strict role-based check
    const levelRoleMap: Record<ReviewLevel, string> = {
      teamlead: 'teamlead',
      hr: 'hr',
      md: 'md'
    };

    if (levelRoleMap[currentLevel] !== reviewerRole) {
      return next(new ErrorResponse('You are not authorized to review this leave at this stage', 403));
    }

    // Reject leave
    leave.status = 'Rejected';
    leave.reviewTrail.push({
      reviewer: reviewerId,
      role: reviewerRole,
      action: 'Rejected',
      date: new Date(),
      note,
    });

    await leave.save();

    // Notify employee about rejection
    await sendNotification({
      user: leave.user,
      type: 'LEAVE_REJECTED',
      title: 'Leave Request Rejected ❌',
      message: `Your ${leave.type} leave request has been rejected.`,
      emailSubject: 'Leave Request Rejected',
      emailTemplate: 'leave-rejected.ejs',
      emailData: {
        name: leave.user.firstName,
        type: leave.type,
        note,
        
        companyName: company?.branding?.displayName || company?.name,
        logoUrl: company?.branding?.logoUrl ,
        primaryColor: company?.branding?.primaryColor || "#0621b6b0",
      },
    });

    await logAudit({
      userId: reviewerId,
      action: 'REJECT_LEAVE_REQUEST',
      status: 'SUCCESS',
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.status(200).json({
      success: true,
      message: 'Leave request rejected',
      data: { data: leave },
    });
  } catch (err: any) {
    next(new ErrorResponse(err.message, 500));
  }
};

export const getLeaveApprovalQueue = async (
  req: TypedRequest,
  res: TypedResponse<{ data: ILeaveRequest[] }>,
  next: NextFunction
): Promise<void> => {
  try {
    const role = req.user?.role;
    const userId = req.user?._id;

    let filter: any = { status: 'Pending' };

    if (role === 'teamlead') {
      filter.reviewLevel = 'teamlead';
      filter.teamlead = userId;
    
    } else if (role === 'hr') {
      filter.reviewLevel = 'hr';
    } else if (role === 'md') {
      filter.reviewLevel = 'md';
    } else {
      // ✅ Removed `return`
      res.status(200).json({ success: true, data: { data: [] } });
      return;
    }

    const leaves = await LeaveRequest.find(filter)
      .populate('user', 'firstName lastName email')
      .sort({ createdAt: -1 });

    // ✅ Removed `return`
    res.status(200).json({ success: true, data: { data: leaves } });

  } catch (err: any) {
    next(err);
  }
};


// export const getLeaveActivityFeed = asyncHandler(async (
//   req: TypedRequest<{}, GetLeaveActivityFeedDTO>,
//   res: TypedResponse<LeaveActivityFeedItem[]>,
// ) => {
//   const userId = req.user?._id;
//   const { status, from, to } = req.query;

//   const filter: any = { user: userId };

//   if (status) filter.status = status;
//   if (from || to) {
//     filter.createdAt = {};
//     if (from) filter.createdAt.$gte = new Date(from as string);
//     if (to) filter.createdAt.$lte = new Date(to as string);
//   }

//   const leaves = await LeaveRequest.find(filter)
//     .sort({ createdAt: -1 })
//     .limit(20)
//     .select('_id type startDate endDate days status reason createdAt user teamLead reviewTrail')
//     .populate('user', 'firstName lastName')
//     .populate('teamLead', 'firstName lastName')
//     .lean();



//    const feed: LeaveActivityFeedItem[] = leaves.map((leave: any) => ({
//     id: leave._id.toString(), // ✅ FIXED: Correctly assign the id
//     employeeId: leave.user?._id?.toString() ?? '',
//     employeeName: `${leave.user?.firstName ?? ''} ${leave.user?.lastName ?? ''}`.trim(),
//     type: leave.type,
//     startDate: leave.startDate,
//     endDate: leave.endDate,
//     days: leave.days,
//     reason: leave.reason,
//     status: leave.status.toLowerCase() as 'approved' | 'rejected' | 'pending',
//     appliedDate: leave.createdAt,
//     teamLeadId: leave.teamLead?._id?.toString() ?? '',
//     teamLeadName: `${leave.teamLead?.firstName ?? ''} ${leave.teamLead?.lastName ?? ''}`.trim(),
//     reviewTrail: leave.reviewTrail?.map((r: any) => ({
//       reviewer: r.reviewer?.toString() ?? '',
//       role: r.role,
//       action: r.action.toLowerCase() as 'approved' | 'rejected',
//       date: r.date?.toISOString() ?? '',
//       note: r.note,
//     })) ?? [],
//   }));


//   res.status(200).json({ success: true, data: feed });
// });

export const getLeaveActivityFeed = asyncHandler(async (
  req: TypedRequest<{}, GetLeaveActivityFeedDTO>,
  res: TypedResponse<LeaveActivityFeedResponse>,
) => {
  const userId = req.user?._id;
  const { status, from, to } = req.query;

  // 🧠 1. FILTERED query for feed
  const filter: any = { user: userId };

  if (status) filter.status = status;
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(from as string);
    if (to) filter.createdAt.$lte = new Date(to as string);
  }

  // 🔍 2. Get filtered feed
  const leaves = await LeaveRequest.find(filter)
    .sort({ createdAt: -1 })
    .limit(20)
    .select('_id type startDate endDate days status reason createdAt user teamlead reviewTrail')
    .populate('user', 'firstName lastName')
    .populate('teamlead', 'firstName lastName')
    .lean();

  // 🧾 3. Get ALL leaves for summary (no filter)
  const allUserLeaves = await LeaveRequest.find({ user: userId }).select('status').lean();

  // 📊 4. Build summary
const summary = {
  pending: allUserLeaves.filter((l) => l.status?.toLowerCase() === 'pending').length,
  approved: allUserLeaves.filter((l) => l.status?.toLowerCase() === 'approved').length,
  rejected: allUserLeaves.filter((l) => l.status?.toLowerCase() === 'rejected').length,
  // expired: allUserLeaves.filter((l) => l.status?.toLowerCase() === 'expired').length, // optional
};


  // 📌 5. Map feed items
  const feed: LeaveActivityFeedItem[] = leaves.map((leave: any) => ({
    id: leave._id.toString(),
    employeeId: leave.user?._id?.toString() ?? '',
    employeeName: `${leave.user?.firstName ?? ''} ${leave.user?.lastName ?? ''}`.trim(),
    type: leave.type,
    startDate: leave.startDate,
    endDate: leave.endDate,
    days: leave.days,
    reason: leave.reason,
    status: leave.status.toLowerCase() as 'approved' | 'rejected' | 'pending',
    appliedDate: leave.createdAt,
    teamleadId: leave.teamlead?._id?.toString() ?? '',
    teamleadName: `${leave.teamlead?.firstName ?? ''} ${leave.teamlead?.lastName ?? ''}`.trim(),
    reviewTrail: leave.reviewTrail?.map((r: any) => ({
      reviewer: r.reviewer?.toString() ?? '',
      role: r.role,
      action: r.action.toLowerCase() as 'approved' | 'rejected' | 'pending',
      date: r.date?.toISOString() ?? '',
      note: r.note,
    })) ?? [],
  }));
  res.status(200).json({
    success: true,
    data: {
      feed,
      summary,
    },
  });
});

// export const getDepartmentTeamLeads = asyncHandler(async (req: TypedRequest, res: any) => {
//   const currentUser = await User.findById(req.user?.id);

//   if (!currentUser) {
//     return res.status(404).json({ success: false, message: 'User not found' });
//   }

//   const cacheKey = `teamLeads:${currentUser.company}:${currentUser.department}`;

//   // Try to get cached data from Redis
//   const cachedData = await redisClient.get(cacheKey);

//   if (cachedData) {
//     // Return cached response
//     return res.status(200).json({
//       success: true,
//       data: JSON.parse(cachedData),
//       cached: true,
//     });
//   }

//   // If not cached, fetch from DB
//   const teamLeads = await User.find({
//     department: currentUser.department,
//     role: 'TeamLead',
//     company: currentUser.company,
//     isActive: true,
//   }).select('_id firstName lastName department');


//   const responseData = teamLeads.map((lead) => ({
//     id: lead._id,
//     name: `${lead.firstName} ${lead.lastName}`,
//     department: lead.department,
//   }));

//   // Store in Redis with 1 hour TTL (3600 seconds)
//   await redisClient.setex(cacheKey, 86400, JSON.stringify(responseData));


//   res.status(200).json({
//     success: true,
//     data: responseData,
//     cached: false,
//   });
// });

export const getLeaveApprovers = asyncHandler(async (req: TypedRequest, res: any) => {
  const currentUser = await User.findById(req.user?.id);

  if (!currentUser) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }

  let approverRole = '';
  let cacheKey = '';

  switch (currentUser.role) {
    case 'employee':
      approverRole = 'teamlead';
      cacheKey = `teamlead:${currentUser.company}:${currentUser.department}`;
      break;

    case 'teamlead':
      approverRole = 'hr';
      cacheKey = `hr:${currentUser.company}`;
      break;

    case 'hr':
      approverRole = 'md';
      cacheKey = `md:${currentUser.company}`;
      break;

    case 'md':
      approverRole = 'md';
      cacheKey = `md:${currentUser.company}`;
      break;

    default:
      return res.status(400).json({ success: false, message: 'Invalid role' });
  }

  // Try cache
  const cached = await redisClient.get(cacheKey);
  if (cached) {
    return res.status(200).json({
      success: true,
      data: JSON.parse(cached),
      cached: true,
    });
  }

  // Build DB query
  const query: any = {
    role: approverRole,
    company: currentUser.company,
    isActive: true,
  };

  if (currentUser.role === 'employee') {
    query.department = currentUser.department;
  }

  const approvers = await User.find(query).select('_id firstName lastName department');

  const result = approvers.map(user => ({
    id: user._id,
    name: `${user.firstName} ${user.lastName}`,
    department: user.department,
  }));

  // Cache it
  await redisClient.setex(cacheKey, 86400, JSON.stringify(result)); // 1 day

  res.status(200).json({
    success: true,
    data: result,
    cached: false,
  });
});

export const getLeaveStatusOverview = async (
  req: TypedRequest,
  res: TypedResponse<{ pending: number; approved: number; rejected: number }>,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?._id;

    const [pending, approved, rejected] = await Promise.all([
      LeaveRequest.countDocuments({ user: userId, status: 'Pending' }),
      LeaveRequest.countDocuments({ user: userId, status: 'Approved' }),
      LeaveRequest.countDocuments({ user: userId, status: 'Rejected' }),
    ]);

    res.status(200).json({
      success: true,
      data: { pending, approved, rejected },
    });
  } catch (err) {
    next(err);
  }
};
