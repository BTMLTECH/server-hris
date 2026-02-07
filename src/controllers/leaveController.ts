// import { NextFunction } from 'express';
// import { Types } from 'mongoose';
// import { asyncHandler } from '../middleware/asyncHandler';
// import LeaveRequest, {
//   ILeaveRequest,
//   LeaveEntitlements,
//   TypedRequestQuery,
// } from '../models/LeaveRequest';
// import User, { IUser } from '../models/user.model';
// import { CreateLeaveRequestBody, CreateLeaveRequestResponse } from '../types/leaveType';
// import { TypedRequest } from '../types/typedRequest';
// import { TypedResponse } from '../types/typedResponse';
// import ErrorResponse from '../utils/ErrorResponse';
// import { logAudit } from '../utils/logAudit';
// import { sendNotification } from '../utils/sendNotification';
// import { redisClient } from '../utils/redisClient';
// import LeaveBalance from '../models/LeaveBalance';
// import { uploadToCloudinary } from '../utils/cloudinary';
// import userModel from '../models/user.model';
// import { Server as SocketIOServer } from 'socket.io';
// import { emitToUser } from '../utils/socketEmitter';
// declare global {
//   var io: SocketIOServer | undefined;
// }

// const MAX_PDF_SIZE = 1 * 1024 * 1024; // 1 MB


// export const createLeaveRequest = asyncHandler(
//   async (
//     req: TypedRequest<{}, {}, CreateLeaveRequestBody>,
//     res: TypedResponse<CreateLeaveRequestResponse>,
//     next: NextFunction,
//   ) => {
//     const {
//       type,
//       startDate,
//       endDate,
//       days,
//       reason,
//       teamleadId,
//       typeIdentify,
//       allowance,
//       relievers: relieverEmails,
//     } = req.body;

//     const userId = req.user?.id;
//     const userRole = req.user?.role;
//     const company = req.company;

//     if (!type || !startDate || !endDate || !reason || !teamleadId || !days) {
//       return next(new ErrorResponse('All fields are required', 400));
//     }

//     const start = new Date(startDate);
//     const end = new Date(endDate);
//     if (end < start) return next(new ErrorResponse('Invalid date range', 400));



//     // Handle file upload
//     // let fileUrl: string | undefined;
//     // if (req.file) {
//     //   const uploadedFile = await uploadToCloudinary(
//     //     req.file.buffer,
//     //     `leave/${company?._id}`,
//     //     'raw',
//     //     `leave_${req.user?.firstName}_${req.user?.lastName}_${Date.now()}.pdf`,
//     //   );
//     //   fileUrl = uploadedFile.secure_url;
//     // }

//     // Handle file upload
//     let fileUrl: string | undefined;

//     if (req.file) {
//       // ❌ Only allow PDFs
//       if (req.file.mimetype !== 'application/pdf') {
//         return next(new ErrorResponse('Only PDF files are allowed', 400));
//       }

//       // ❌ Enforce size limit
//       if (req.file.size > MAX_PDF_SIZE) {
//         const maxSizeMB = (MAX_PDF_SIZE / (1024 * 1024)).toFixed(0);
//         const uploadedSizeMB = (req.file.size / (1024 * 1024)).toFixed(2);

//         return next(
//           new ErrorResponse(
//             `PDF file is too large (${uploadedSizeMB}MB). Maximum allowed size is ${maxSizeMB}MB.`,
//             400,
//           ),
//         );
//       }

//       // ✅ Upload if valid
//       const uploadedFile = await uploadToCloudinary(
//         req.file.buffer,
//         `leave/${company?._id}`,
//         'raw',
//         `leave_${req.user?.firstName}_${req.user?.lastName}_${Date.now()}.pdf`,
//       );

//       fileUrl = uploadedFile.secure_url;
//     }

//         // Get or initialize leave balance
//     let balance = await LeaveBalance.findOne({ user: userId, year: new Date().getFullYear() });
//     if (!balance) balance = await LeaveBalance.create({ user: userId, company: company?._id });

//     if (days > balance.balances[type]) {
//       return next(
//         new ErrorResponse(
//           `Insufficient ${type} leave balance. You only have ${balance.balances[type]} days left.`,
//           400,
//         ),
//       );
//     }

//     // Deduct leave immediately
//     balance.balances[type] -= days;
//     await balance.save();

//     let relieversWithNames: any[] = [];
//     let reviewLevels: string[] = [];

//     if (userRole !== 'teamlead') {
//       // Staff must provide 2-3 relievers
//       if (!relieverEmails || relieverEmails.length < 2 || relieverEmails.length > 3) {
//         return next(new ErrorResponse('You must provide 2 or 3 relievers', 400));
//       }

//       const relieverUsers = (await userModel.find({ email: { $in: relieverEmails } })) as IUser[];
//       if (relieverUsers.length < 2 || relieverUsers.length > 3) {
//         return next(new ErrorResponse('Some relievers are invalid', 400));
//       }

//       relieversWithNames = relieverUsers.map((reliever) => ({
//         user: reliever._id,
//         firstName: reliever.firstName,
//         lastName: reliever.lastName,
//       }));

//       reviewLevels = [...relieversWithNames.map(() => 'reliever'), 'teamlead', 'hr'];

//       // Notify relievers
//       await Promise.all(
//         relieverUsers.map(async (reliever) => {
//           try {
//             await sendNotification({
//               user: reliever,
//               type: 'NEW_LEAVE_REQUEST',
//               title: 'Leave Request Requires Your Review',
//               message: `${req.user?.firstName} submitted a ${type} leave from ${startDate} to ${endDate}. You are listed as a reliever.`,
//               emailSubject: 'Leave Request to Review',
//               emailTemplate: 'leave-review-request.ejs',
//               emailData: {
//                 reviewerName: reliever.firstName,
//                 employeeName: req.user?.firstName,
//                 type,
//                 startDate,
//                 endDate,
//                 daysCount: days,
//                 companyName: company?.branding?.displayName || company?.name,
//                 logoUrl: company?.branding?.logoUrl,
//                 primaryColor: company?.branding?.primaryColor || '#0621b6b0',
//               },
//             });
//           } catch {}
//         }),
//       );
//     } else {
//       // Teamlead leave → no relievers
//       reviewLevels = ['hr', 'md'];
//     }

//     // Create leave request
//     const leave = await LeaveRequest.create({
//       user: userId,
//       teamlead: teamleadId,
//       relievers: relieversWithNames,
//       type,
//       startDate: start,
//       endDate: end,
//       days: Number(days),
//       reason,
//       status: 'Pending',
//       reviewLevels,
//       typeIdentify,
//       allowance: allowance === 'yes',
//       url: fileUrl,
//       reviewTrail: [],
//     });

//     // Audit log
//     await logAudit({
//       userId,
//       action: 'CREATE_LEAVE_REQUEST',
//       status: 'SUCCESS',
//       ip: req.ip,
//       userAgent: req.get('user-agent'),
//     });

//     res.status(201).json({
//       success: true,
//       message: 'Leave request submitted',
//       data: { data: leave },
//     });
//   },
// );


// export const approveLeaveRequest = asyncHandler(
//   async (req: TypedRequest<{ id?: string }, {}, {}>, res: any, next: NextFunction) => {
//     try {
//       const leaveId = req.params.id;
//       const reviewer = req.user!;
//       const reviewerId = reviewer._id as Types.ObjectId;
//       const company = req.company;

//       const leave = await LeaveRequest.findById(leaveId).populate<{ user: IUser }>('user');

//       if (!leave) return next(new ErrorResponse('Leave not found', 404));
//       if (leave.status !== 'Pending') return next(new ErrorResponse('Leave already reviewed', 400));

//       const completedReviews = leave.reviewTrail?.length || 0;
//       const currentLevel = leave.reviewLevels[completedReviews];
//       const relievers = leave.relievers || [];

//       // ✅ Approve reliever
//       if (currentLevel === 'reliever') {
//         const reliever = relievers.find((r) => r.user.toString() === reviewerId.toString());
//         if (reliever) {
//           reliever.status = 'Approved';
//           reliever.creactedAt = new Date();
//         }
//       }

//       // ✅ Add to review trail
//       leave.reviewTrail.push({
//         reviewer: reviewerId,
//         role: currentLevel,
//         action: 'Approved',
//         date: new Date(),
//       });

//       // ✅ Update leave status if last stage
//       const isLastStage = completedReviews + 1 === leave.reviewLevels.length;
//       if (isLastStage) {
//         leave.status = 'Approved';
//         leave.isActive = true;
//       }

//       await LeaveRequest.updateOne({ _id: leaveId }, leave);

//       // ✅ Send notifications
//       if (isLastStage) {
//         // Notify employee of full approval
//         await sendNotification({
//           user: leave.user,
//           type: 'LEAVE_APPROVED',
//           title: 'Leave Approved ✅',
//           message: `Your ${leave.type} leave has been fully approved.`,
//           emailSubject: 'Leave Approved',
//           emailTemplate: 'leave-approved.ejs',
//           emailData: {
//             name: leave.user.firstName,
//             type: leave.type,
//             startDate: leave.startDate,
//             endDate: leave.endDate,
//             days: leave.days,
//             companyName: company?.branding?.displayName || company?.name,
//             logoUrl: company?.branding?.logoUrl,
//             primaryColor: company?.branding?.primaryColor || '#0621b6b0',
//           },
//         });
//       } else {
//         // Notify next reviewer
//         const nextLevel = leave.reviewLevels[completedReviews + 1];
//         let nextReviewer;

//         if (nextLevel === 'reliever') {
//           const nextReliever = relievers.find((r) => r.status === 'Pending');
//           if (nextReliever) nextReviewer = await userModel.findById(nextReliever.user);
//         } else if (nextLevel === 'teamlead') {
//           nextReviewer = await userModel.findById(leave.teamlead);
//         } else if (nextLevel === 'hr') {
//           nextReviewer = await userModel.findOne({ role: 'hr', company: reviewer.company });
//         } else if (nextLevel === 'md') {
//           nextReviewer = await userModel.findOne({ role: 'md', company: reviewer.company });
//         }

//         if (nextReviewer) {
//           await sendNotification({
//             user: nextReviewer,
//             type: 'LEAVE_AWAITING_REVIEW',
//             title: 'Leave Awaiting Review',
//             message: `${leave.user.firstName}'s ${leave.type} leave is pending your review.`,
//             emailSubject: 'Leave Approval Needed',
//             emailTemplate: 'leave-review-request.ejs',
//             emailData: {
//               reviewerName: nextReviewer.firstName,
//               employeeName: leave.user.firstName,
//               type: leave.type,
//               startDate: leave.startDate,
//               endDate: leave.endDate,
//               days: leave.days,
//               companyName: company?.branding?.displayName || company?.name,
//               logoUrl: company?.branding?.logoUrl,
//               primaryColor: company?.branding?.primaryColor || '#0621b6b0',
//             },
//           });
//         }
//       }

//       // ✅ Audit log
//       await logAudit({
//         userId: reviewerId,
//         action: 'APPROVE_LEAVE_REQUEST',
//         status: 'SUCCESS',
//         ip: req.ip,
//         userAgent: req.get('user-agent'),
//       });

//       res.status(200).json({
//         success: true,
//         message: isLastStage ? 'Leave fully approved' : 'Leave approved at current stage',
//         data: { data: leave },
//       });
//     } catch (err: any) {
//       next(new ErrorResponse(err.message, 500));
//     }
//   },
// );

// export const rejectLeaveRequest = asyncHandler(
//   async (req: TypedRequest<{ id?: string }, {}, {}>, res: any, next: NextFunction) => {
//     try {
//       const leaveId = req.params.id;
//       const reviewer = req.user!;
//       const reviewerId = reviewer._id as Types.ObjectId;
//       const company = req.company;

//       const leave = await LeaveRequest.findById(leaveId).populate<{ user: IUser }>('user');
//       if (!leave) return next(new ErrorResponse('Leave not found', 404));
//       if (leave.status !== 'Pending') return next(new ErrorResponse('Leave already reviewed', 400));

//       const completedReviews = leave.reviewTrail?.length || 0;
//       const currentLevel = leave.reviewLevels[completedReviews];
//       const relievers = leave.relievers || [];

//       // ✅ Reject reliever if current stage
//       if (currentLevel === 'reliever') {
//         const reliever = relievers.find((r) => r.user.toString() === reviewerId.toString());
//         if (reliever) {
//           reliever.status = 'Rejected';
//           reliever.creactedAt = new Date();
//         }
//       }

//       // ✅ Push rejection to review trail
//       leave.reviewTrail.push({
//         reviewer: reviewerId,
//         role: currentLevel,
//         action: 'Rejected',
//         date: new Date(),
//       });

//       // ✅ Determine if this is final stage (MD for teamlead leave counts as final)
//       const isLastStage =
//         completedReviews + 1 === leave.reviewLevels.length ||
//         (currentLevel === 'md' && leave.reviewLevels.includes('md'));

//       if (isLastStage) {
//         leave.status = 'Rejected';
//       }

//       await LeaveRequest.updateOne({ _id: leaveId }, leave);

//       // ✅ Notify employee
//       await sendNotification({
//         user: leave.user,
//         type: 'LEAVE_REJECTED',
//         title: 'Leave Rejected ❌',
//         message: `Your ${leave.type} leave has been rejected at the ${currentLevel} review stage.`,
//         emailSubject: 'Leave Rejected',
//         emailTemplate: 'leave-rejected.ejs',
//         emailData: {
//           name: leave.user.firstName,
//           type: leave.type,
//           startDate: leave.startDate,
//           endDate: leave.endDate,
//           days: leave.days,
//           companyName: company?.branding?.displayName || company?.name,
//           logoUrl: company?.branding?.logoUrl,
//           primaryColor: company?.branding?.primaryColor || '#0621b6b0',
//         },
//       });

//       await logAudit({
//         userId: reviewerId,
//         action: 'REJECT_LEAVE_REQUEST',
//         status: 'SUCCESS',
//         ip: req.ip,
//         userAgent: req.get('user-agent'),
//       });

//       res.status(200).json({
//         success: true,
//         message: 'Leave rejected',
//         data: { data: leave },
//       });
//     } catch (err: any) {
//       next(new ErrorResponse(err.message, 500));
//     }
//   },
// );

// export const getLeaveApprovalQueue = asyncHandler(
//   async (
//     req: TypedRequest<{}, {}, {}>,
//     res: TypedResponse<{ data: ILeaveRequest[] }>,
//     next: NextFunction,
//   ) => {
//     try {
//       const userRole = req.user?.role!;
//       const userId = req.user?._id;

//       if (!userRole || !userId) {
//         res.status(200).json({ success: true, data: { data: [] } });
//         return;
//       }

//       // Pull all pending leaves
//       const leaves: ILeaveRequest[] = await LeaveRequest.find({ status: 'Pending' })
//         .populate('user', 'staffId firstName lastName email')
//         .sort({ createdAt: -1 });

//       const queue: ILeaveRequest[] = leaves.filter((leave) => {
//         const completedReviews = leave.reviewTrail?.length || 0;
//         const currentLevel = leave.reviewLevels[completedReviews];

//        const isTeamLeadLeave = !leave.reviewLevels.includes('teamlead');

//         if (currentLevel === 'reliever') {
//           return leave.relievers?.some(
//             (r) => r.user.toString() === userId.toString() && r.status === 'Pending',
//           );
//         }

// // =========================
//         // TEAMLEAD STAGE
//         // (staff leaves ONLY)
//         // =========================
//         if (currentLevel === 'teamlead') {
//           if (isTeamLeadLeave) return false; // 🚫 teamlead must never see own leave

//           const allRelieversApproved = leave.relievers?.every(
//             (r) => r.status === 'Approved',
//           );

//           return (
//             allRelieversApproved &&
//             leave.teamlead.toString() === userId.toString()
//           );
//         }

//         // =========================
//         // HR STAGE
//         // =========================
//         if (currentLevel === 'hr') {
//           // Teamlead-created leave → HR is first reviewer
//           if (isTeamLeadLeave) {
//             return userRole === 'hr';
//           }

//           // Staff leave → teamlead must have approved
//           const teamleadApproved = leave.reviewTrail?.some(
//             (r) => r.role === 'teamlead' && r.action === 'Approved',
//           );

//           return teamleadApproved && userRole === 'hr';
//         }

//         // =========================
//         // MD STAGE
//         // =========================
//          if (currentLevel === 'md' && isTeamLeadLeave) {

//         const hrApproved = leave.reviewTrail?.some(
//           (r) => r.role === 'hr' && r.action === 'Approved'
//         );

//         return hrApproved && userRole === 'md';
//       }

        

//         return false;
//       });

//       res.status(200).json({ success: true, data: { data: queue } });
//     } catch (err) {
//       next(err);
//     }
//   },
// );

// export const getLeaveActivityFeed = asyncHandler(
//   async (req: TypedRequest<{}, TypedRequestQuery, {}>, res: any, _next: NextFunction) => {
//     const userId = req.user?._id as Types.ObjectId;
//     const userRole = req.user?.role;
//     const { status, from, to, page = '1', limit = '20' } = req.query;

//     if (!userId) {
//       return res.status(401).json({ success: false, message: 'User not authenticated' });
//     }

//     const pageNum = parseInt(page, 10);
//     const pageSize = parseInt(limit, 10);
//     const skip = (pageNum - 1) * pageSize;

//     // 🔹 1) Base filter
//     const baseFilter: any = {};
//     if (status) {
//       baseFilter.status = {
//         $in: [status, String(status).charAt(0).toUpperCase() + String(status).slice(1)],
//       };
//     }
//     if (from || to) {
//       baseFilter.createdAt = {};
//       if (from) baseFilter.createdAt.$gte = new Date(from);
//       if (to) baseFilter.createdAt.$lte = new Date(to);
//     }

//     // 🔹 2) My own requests (with pagination)
//     const [myRequestsRaw, myTotal] = await Promise.all([
//       LeaveRequest.find({
//         ...baseFilter,
//         user: userId,
//       })
//         .sort({ createdAt: -1 })
//         .skip(skip)
//         .limit(pageSize)
//         .select(
//           '_id type startDate endDate days status reason createdAt user teamlead reviewLevels reviewTrail relievers allowance url',
//         )
//         .populate('user', 'staffId firstName lastName department')
//         .lean(),
//       LeaveRequest.countDocuments({ ...baseFilter, user: userId }),
//     ]);

//     // 🔹 3) Approvals (reliever/teamlead/hr)
//     const roleConditions: any[] = [];

//     // (a) Reliever stage
//     roleConditions.push({
//       relievers: {
//         $elemMatch: {
//           user: userId,
//           status: { $in: ['Pending', 'pending'] },
//         },
//       },
//       status: { $nin: ['Rejected', 'rejected'] },
//     });

//     // (b) Teamlead stage
//     roleConditions.push({
//       teamlead: userId,
//       status: { $in: ['Pending', 'pending'] },
//       reviewLevels: { $ne: ['hr', 'md'] },
//       relievers: {
//         $not: {
//           $elemMatch: {
//             status: { $in: ['Pending', 'pending', 'Rejected', 'rejected'] },
//           },
//         },
//       },
//       $nor: [{ reviewTrail: { $elemMatch: { role: 'teamlead' } } }],
//     });

     
//     if (userRole === 'hr') {
//       roleConditions.push({
//         status: { $in: ['Pending', 'pending'] },

//         // HR must not have acted already
//         $nor: [{ reviewTrail: { $elemMatch: { role: 'hr' } } }],

//         $or: [
//           // ✅ Staff leave → teamlead approved
//           {
//             reviewTrail: {
//               $elemMatch: {
//                 role: 'teamlead',
//                 action: { $in: ['Approved', 'approved'] },
//               },
//             },
//           },

//           // ✅ Teamlead-created leave → HR is first reviewer
//           {
//             reviewLevels: ['hr', 'md'],
//           },
//         ],
//       });
//     }


//     // (d) MD stage — only see their own leave after HR approval
//   if (userRole === 'md') {
//     roleConditions.push({
//       user: userId, // <-- MD sees only their own leave
//       status: { $in: ['Pending', 'pending'] },

//       // HR must have approved
//       reviewTrail: {
//         $elemMatch: {
//           role: 'hr',
//           action: { $in: ['Approved', 'approved'] },
//         },
//       },

//       // MD must not have acted yet
//       $nor: [{ reviewTrail: { $elemMatch: { role: 'md' } } }],
//     });
//   }



//     const [approvalsRaw, approvalsTotal] = await Promise.all([
//       LeaveRequest.find({
//         ...baseFilter,
//         $or: roleConditions,
//       })
//         .sort({ createdAt: -1 })
//         .skip(skip)
//         .limit(pageSize)
//         .select(
//           '_id type startDate endDate days status reason createdAt user teamlead reviewTrail reviewLevels relievers allowance url',
//         )
//         .populate('user', 'staffId firstName lastName department')
//         .lean(),
//       LeaveRequest.countDocuments({ ...baseFilter, $or: roleConditions }),
//     ]);

//     // 🔹 4) HR/Admin extra → fetch all APPROVED requests
//     let allApprovedRaw: any[] = [];
//     let allApprovedTotal = 0;

//     if (['hr', 'admin'].includes(userRole!)) {
//       const approvedFilter = {
//         ...baseFilter,
//         status: { $in: ['Approved', 'approved'] },
//       };

//       [allApprovedRaw, allApprovedTotal] = await Promise.all([
//         LeaveRequest.find(approvedFilter)
//           .sort({ createdAt: -1 })
//           .skip(skip)
//           .limit(pageSize)
//           .select(
//             '_id type startDate endDate days status reason createdAt user teamlead reviewTrail reviewLevels relievers allowance url',
//           )
//           .populate('user', 'staffId firstName lastName department')
//           .lean(),
//         LeaveRequest.countDocuments(approvedFilter),
//       ]);
//     }

//     // 🔹 5) Mapping helper
//     const mapLeave = (leave: any) => {
//       let currentReviewerRole: 'reliever' | 'teamlead' | 'hr' | 'md' | null = null;
//         const completedReviews = leave.reviewTrail?.length || 0;
//         currentReviewerRole = leave.reviewLevels?.[completedReviews] ?? null;

//       return {
//         id: leave._id.toString(),
//         employeeId: leave.user?._id?.toString() ?? '',
//         employeeName: `${leave.user?.firstName ?? ''} ${leave.user?.lastName ?? ''}`.trim(),
//         department: leave.user?.department,
//         type: leave.type,
//         staffId: leave.user?.staffId,
//         startDate: leave.startDate,
//         endDate: leave.endDate,
//         days: leave.days,
//         reason: leave.reason,
//         status: String(leave.status).toLowerCase(),
//         appliedDate: leave.createdAt,
//         teamleadId: leave.teamlead?.toString?.() ?? '',
//         teamleadName: '',
//         currentReviewerRole,
//         relievers: (leave.relievers ?? []).map((r: any) => ({
//           user: r.user?.toString?.() ?? '',
//           firstName: r.firstName,
//           lastName: r.lastName,
//           status: String(r.status ?? 'pending').toLowerCase(),
//           note: r.note ?? undefined,
//           actedAt: r.actedAt ?? undefined,
//         })),
//         reviewTrail: (leave.reviewTrail ?? []).map((r: any) => ({
//           reviewer: r.reviewer?.toString?.() ?? '',
//           role: r.role,
//           action: String(r.action).toLowerCase(),
//           date: r.date ? new Date(r.date).toISOString() : '',
//           note: r.note,
//         })),
//         allowance: !!leave.allowance,
//         url: leave.url ?? undefined,
//       };
//     };

//     // 🔹 6) Summary (only for my requests)
//     const allUserLeaves = await LeaveRequest.find({ user: userId }).select('status').lean();
//     const summary = {
//       pending: allUserLeaves.filter((l) => ['pending', 'Pending'].includes(l.status)).length,
//       approved: allUserLeaves.filter((l) => ['approved', 'Approved'].includes(l.status)).length,
//       rejected: allUserLeaves.filter((l) => ['rejected', 'Rejected'].includes(l.status)).length,
//       expired: allUserLeaves.filter((l) => ['expired', 'Expired'].includes(l.status)).length,
//     };

//     // 🔹 7) Leave balances
//     const year = new Date().getFullYear();
//     const leaveBalance = await LeaveBalance.findOne({ user: userId, year }).lean();
//     const balance = leaveBalance
//       ? Object.entries(leaveBalance.balances).map(([type, remaining]) => ({
//           type,
//           remaining,
//         }))
//       : Object.entries(LeaveEntitlements).map(([type, entitlement]) => ({
//           type,
//           remaining: entitlement,
//         }));

//     const payload: any = {
//       data: {
//         myRequests: myRequestsRaw.map(mapLeave),
//         approvals: approvalsRaw.map(mapLeave),
//         allApproved: allApprovedRaw.map(mapLeave),
//         pagination: {
//           myRequests: {
//             total: myTotal,
//             page: pageNum,
//             limit: pageSize,
//             pages: Math.ceil(myTotal / pageSize),
//           },
//           approvals: {
//             total: approvalsTotal,
//             page: pageNum,
//             limit: pageSize,
//             pages: Math.ceil(approvalsTotal / pageSize),
//           },
//           allApproved: {
//             total: allApprovedTotal,
//             page: pageNum,
//             limit: pageSize,
//             pages: Math.ceil(allApprovedTotal / pageSize),
//           },
//         },
//         summary,
//         balance,
//       },
//     };

//     emitToUser(userId, 'leave:update', payload.data);

//     res.status(200).json({
//       success: true,
//       data: payload.data,
//     });
//   },
// );

// export const getLeaveApprovers = asyncHandler(
//   async (req: TypedRequest, res: any, _next: NextFunction) => {
//     const currentUser = await User.findById(req.user?.id);
//     if (!currentUser) {
//       return res.status(404).json({ success: false, message: 'User not found' });
//     }
//     let approverRoles: string[] = [];
//     let cacheKey = '';
//     switch (currentUser.role) {
//       case 'employee':
//         approverRoles = ['reliever', 'teamlead', 'hr'];
//         cacheKey = `approvers:employee:${currentUser.company}:${currentUser.department}`;
//         break;
//       case 'teamlead':
//         approverRoles = ['hr'];
//         cacheKey = `approvers:teamlead:${currentUser.company}`;
//         break;
//       case 'hr':
//         approverRoles = [];
//         cacheKey = `approvers:hr:${currentUser.company}`;
//         break;
//       default:
//         return res.status(400).json({ success: false, message: 'Invalid role' });
//     }

//     const cached = await redisClient.get(cacheKey);
//     if (cached) {
//       return res.status(200).json({
//         success: true,
//         data: JSON.parse(cached),
//         cached: true,
//       });
//     }
//     if (approverRoles.length === 0) {
//       return res.status(200).json({
//         success: true,
//         data: [],
//         cached: false,
//       });
//     }

//     const query: any = {
//       role: { $in: approverRoles },
//       company: currentUser.company,
//       isActive: true,
//     };
//     if (currentUser.role === 'employee') {
//       query.$or = [
//         { role: 'reliever', department: currentUser.department },
//         { role: 'teamlead', department: currentUser.department },
//         { role: 'hr' },
//       ];
//     }
//     const approvers = await User.find(query).select('_id firstName lastName department role');
//     const relievers = approvers.filter((u) => u);
//     const teamlead = approvers.find((u) => u.role === 'teamlead');
//     const hr = approvers.find((u) => u.role === 'hr');
//     const orderedApprovers = [
//       ...relievers.map((u) => ({
//         id: u._id,
//         name: `${u.firstName} ${u.lastName}`,
//         department: u.department,
//         role: u.role,
//       })),
//       ...(teamlead
//         ? [
//             {
//               id: teamlead._id,
//               name: `${teamlead.firstName} ${teamlead.lastName}`,
//               department: teamlead.department,
//               role: teamlead.role,
//             },
//           ]
//         : []),
//       ...(hr
//         ? [
//             {
//               id: hr._id,
//               name: `${hr.firstName} ${hr.lastName}`,
//               department: hr.department,
//               role: hr.role,
//             },
//           ]
//         : []),
//     ];
//     await redisClient.setex(cacheKey, 86400, JSON.stringify(orderedApprovers));
//     res.status(200).json({
//       success: true,
//       data: orderedApprovers,
//       cached: false,
//     });
//   },
// );



// export const deleteLeave = asyncHandler(
//   async (req: TypedRequest<{ id?: string }, {}, {}>, res: any, next: NextFunction)  => {
//     const leaveId = req.params.id;
//     const userId = req.user?._id;
//     const companyId = req.company?._id;



//     // 1. Find leave
//     const leave = await LeaveRequest.findById(leaveId);
//     if (!leave) {
//       return next(new ErrorResponse("Leave request not found", 404));
//     }

//     if (!leave) return next(new ErrorResponse("Leave request not found", 404));


//     // 2. Prevent deleting processed leave
//     if (leave.status !== "Pending") {
//       return next(
//         new ErrorResponse(
//           "You cannot delete this leave request because it has already been processed",
//           400
//         )
//       );
//     }



//     // 3. Restore Leave Balance
//     const balance = await LeaveBalance.findOne({
//       user: leave.user,
//       company: companyId,
//       year: new Date().getFullYear(),
//     });

//     if (!balance) {
//       return next(new ErrorResponse("Leave balance not found", 400));
//     }

    
//     // TS fix — days is required but TypeScript doesn't know
//     const restoredDays = leave.days!;
    
    
    
//     balance.balances[leave.type] += restoredDays;
//     await balance.save();

//     // 4. Delete leave
//     await leave.deleteOne();

//     // 5. Audit
//     await logAudit({
//       userId,
//       action: "DELETE_LEAVE_REQUEST",
//       status: "SUCCESS",
//       ip: req.ip,
//       userAgent: req.get("user-agent"),
//       details: {
//         leaveId,
//         restoredDays,
//         leaveType: leave.type,
//       },
//     });

//     res.status(200).json({
//       success: true,
//       message: "Leave request deleted and leave balance restored",
//     });
//   }
// );


import { NextFunction } from 'express';
import { Types } from 'mongoose';
import { asyncHandler } from '../middleware/asyncHandler';
import LeaveRequest, {
  ILeaveRequest,
  LeaveEntitlements,
  TypedRequestQuery,
} from '../models/LeaveRequest';
import User, { IUser } from '../models/user.model';
import { CreateLeaveRequestBody, CreateLeaveRequestResponse } from '../types/leaveType';
import { TypedRequest } from '../types/typedRequest';
import { TypedResponse } from '../types/typedResponse';
import ErrorResponse from '../utils/ErrorResponse';
import { logAudit } from '../utils/logAudit';
import { sendNotification } from '../utils/sendNotification';
import { redisClient } from '../utils/redisClient';
import LeaveBalance from '../models/LeaveBalance';
import { uploadToCloudinary } from '../utils/cloudinary';
import userModel from '../models/user.model';
import { Server as SocketIOServer } from 'socket.io';
import { emitToUser } from '../utils/socketEmitter';
declare global {
  var io: SocketIOServer | undefined;
}

const MAX_PDF_SIZE = 1 * 1024 * 1024; // 1 MB

// export const createLeaveRequest = asyncHandler(
//   async (
//     req: TypedRequest<{}, {}, CreateLeaveRequestBody>,
//     res: TypedResponse<CreateLeaveRequestResponse>,
//     next: NextFunction,
//   ) => {
//     const {
//       type,
//       startDate,
//       endDate,
//       days,
//       reason,
//       teamleadId,
//       typeIdentify,
//       allowance,
//       relievers: relieverEmails,
//     } = req.body;

//     const userId = req.user?.id;
//     const company = req.company;

//     if (!type || !startDate || !endDate || !reason || !teamleadId || !days) {
//       return next(new ErrorResponse('All fields are required', 400));
//     }

//     if (!relieverEmails || relieverEmails.length < 2 || relieverEmails.length > 3) {
//       return next(new ErrorResponse('You must provide 2 or 3 relievers', 400));
//     }

//     const start = new Date(startDate);
//     const end = new Date(endDate);

//     if (end < start) {
//       return next(new ErrorResponse('Invalid date range', 400));
//     }

//     // Get or initialize leave balance
//     let balance = await LeaveBalance.findOne({ user: userId, year: new Date().getFullYear() });
//     if (!balance) balance = await LeaveBalance.create({ user: userId, company: company?._id });

//     if (days > balance.balances[type]) {
//       return next(
//         new ErrorResponse(
//           `Insufficient ${type} leave balance. You only have ${balance.balances[type]} days left.`,
//           400,
//         ),
//       );
//     }

//     // Deduct leave immediately
//     balance.balances[type] -= days;
//     await balance.save();

//     // Handle file upload
//     let fileUrl: string | undefined;
//     if (req.file) {
//       const uploadedFile = await uploadToCloudinary(
//         req.file.buffer,
//         `leave/${company?._id}`,
//         'raw',
//         `leave_${req.user?.firstName}_${req.user?.lastName}_${Date.now()}.pdf`,
//       );
//       fileUrl = uploadedFile.secure_url;
//     }

//     // Convert reliever emails to User objects
//     const relieverUsers = (await userModel.find({ email: { $in: relieverEmails } })) as IUser[];
//     if (relieverUsers.length < 2 || relieverUsers.length > 3) {
//       return next(new ErrorResponse('Some relievers are invalid', 400));
//     }

//     const relieversWithNames = relieverUsers.map((reliever) => ({
//       user: reliever._id,
//       firstName: reliever.firstName,
//       lastName: reliever.lastName,
//     }));

//     const reviewLevels = [...relieversWithNames.map(() => 'reliever'), 'teamlead', 'hr'];

//     // Create leave request
//     const leave = await LeaveRequest.create({
//       user: userId,
//       teamlead: teamleadId,
//       relievers: relieversWithNames,
//       type,
//       startDate: start,
//       endDate: end,
//       days: Number(days),
//       reason,
//       status: 'Pending',
//       reviewLevels,
//       typeIdentify,
//       allowance: allowance === 'yes',
//       url: fileUrl,
//       reviewTrail: [],
//     });

//     // Notify relievers
//     await Promise.all(
//       relieverUsers.map(async (reliever) => {
//         try {
//           await sendNotification({
//             user: reliever,
//             type: 'NEW_LEAVE_REQUEST',
//             title: 'Leave Request Requires Your Review',
//             message: `${req.user?.firstName} submitted a ${type} leave from ${startDate} to ${endDate}. You are listed as a reliever.`,
//             emailSubject: 'Leave Request to Review',
//             emailTemplate: 'leave-review-request.ejs',
//             emailData: {
//               reviewerName: reliever.firstName,
//               employeeName: req.user?.firstName,
//               type,
//               startDate,
//               endDate,
//               daysCount: days,
//               companyName: company?.branding?.displayName || company?.name,
//               logoUrl: company?.branding?.logoUrl,
//               primaryColor: company?.branding?.primaryColor || '#0621b6b0',
//             },
//           });
//         } catch {}
//       }),
//     );

//     // Audit log
//     await logAudit({
//       userId,
//       action: 'CREATE_LEAVE_REQUEST',
//       status: 'SUCCESS',
//       ip: req.ip,
//       userAgent: req.get('user-agent'),
//     });

//     res.status(201).json({
//       success: true,
//       message: 'Leave request submitted',
//       data: { data: leave },
//     });
//   },
// );


export const createLeaveRequest = asyncHandler(
  async (
    req: TypedRequest<{}, {}, CreateLeaveRequestBody>,
    res: TypedResponse<CreateLeaveRequestResponse>,
    next: NextFunction,
  ) => {
    const {
      type,
      startDate,
      endDate,
      days,
      reason,
      teamleadId,
      typeIdentify,
      allowance,
      relievers: relieverEmails,
    } = req.body;

    const userId = req.user?.id;
    const userRole = req.user?.role;
    const company = req.company;

    if (!type || !startDate || !endDate || !reason || !teamleadId || !days) {
      return next(new ErrorResponse('All fields are required', 400));
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    if (end < start) return next(new ErrorResponse('Invalid date range', 400));

    let fileUrl: string | undefined;

    if (req.file) {
      if (req.file.mimetype !== 'application/pdf') {
        return next(new ErrorResponse('Only PDF files are allowed', 400));
      }

      if (req.file.size > MAX_PDF_SIZE) {
        const maxSizeMB = (MAX_PDF_SIZE / (1024 * 1024)).toFixed(0);
        const uploadedSizeMB = (req.file.size / (1024 * 1024)).toFixed(2);

        return next(
          new ErrorResponse(
            `PDF file is too large (${uploadedSizeMB}MB). Maximum allowed size is ${maxSizeMB}MB.`,
            400,
          ),
        );
      }

      const uploadedFile = await uploadToCloudinary(
        req.file.buffer,
        `leave/${company?._id}`,
        'raw',
        `leave_${req.user?.firstName}_${req.user?.lastName}_${Date.now()}.pdf`,
      );

      fileUrl = uploadedFile.secure_url;
    }

    // Get or initialize leave balance
    let balance = await LeaveBalance.findOne({ user: userId, year: new Date().getFullYear() });
    if (!balance) balance = await LeaveBalance.create({ user: userId, company: company?._id });

    if (days > balance.balances[type]) {
      return next(
        new ErrorResponse(
          `Insufficient ${type} leave balance. You only have ${balance.balances[type]} days left.`,
          400,
        ),
      );
    }

    balance.balances[type] -= days;
    await balance.save();

    let relieversWithNames: any[] = [];
    let reviewLevels: string[] = [];

    if (!relieverEmails || relieverEmails.length < 2 || relieverEmails.length > 3) {
      return next(new ErrorResponse('You must provide 2 or 3 relievers', 400));
    }

    const relieverUsers = (await userModel.find({ email: { $in: relieverEmails } })) as IUser[];
    if (relieverUsers.length < 2 || relieverUsers.length > 3) {
      return next(new ErrorResponse('Some relievers are invalid', 400));
    }

    relieversWithNames = relieverUsers.map((reliever) => ({
      user: reliever._id,
      firstName: reliever.firstName,
      lastName: reliever.lastName,
    }));

    // ⭐⭐⭐ FIXED REVIEW LEVEL LOGIC ⭐⭐⭐
    const isTeamLead = userRole === 'teamlead';

    reviewLevels = isTeamLead
      ? [...relieversWithNames.map(() => 'reliever'), 'hr', 'md'] // TEAMLEAD LEAVE
      : [...relieversWithNames.map(() => 'reliever'), 'teamlead', 'hr', 'md']; // EMPLOYEE LEAVE

    // Notify relievers
    await Promise.all(
      relieverUsers.map(async (reliever) => {
        try {
          await sendNotification({
            user: reliever,
            type: 'NEW_LEAVE_REQUEST',
            title: 'Leave Request Requires Your Review',
            message: `${req.user?.firstName} submitted a ${type} leave from ${startDate} to ${endDate}. You are listed as a reliever.`,
            emailSubject: 'Leave Request to Review',
            emailTemplate: 'leave-review-request.ejs',
            emailData: {
              reviewerName: reliever.firstName,
              employeeName: req.user?.firstName,
              type,
              startDate,
              endDate,
              daysCount: days,
              companyName: company?.branding?.displayName || company?.name,
              logoUrl: company?.branding?.logoUrl,
              primaryColor: company?.branding?.primaryColor || '#0621b6b0',
            },
          });
        } catch {}
      }),
    );

    // Create leave request
    const leave = await LeaveRequest.create({
      user: userId,
      teamlead: teamleadId,
      relievers: relieversWithNames,
      type,
      startDate: start,
      endDate: end,
      days: Number(days),
      reason,
      status: 'Pending',
      reviewLevels,
      typeIdentify,
      allowance: allowance === 'yes',
      url: fileUrl,
      reviewTrail: [],
    });

    // Audit log
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
  },
);


// export const createLeaveRequest = asyncHandler(
//   async (
//     req: TypedRequest<{}, {}, CreateLeaveRequestBody>,
//     res: TypedResponse<CreateLeaveRequestResponse>,
//     next: NextFunction,
//   ) => {
//     const {
//       type,
//       startDate,
//       endDate,
//       days,
//       reason,
//       teamleadId,
//       typeIdentify,
//       allowance,
//       relievers: relieverEmails,
//     } = req.body;

//     const userId = req.user?.id;
//     // const userRole = req.user?.role;
//     const company = req.company;

//     if (!type || !startDate || !endDate || !reason || !teamleadId || !days) {
//       return next(new ErrorResponse('All fields are required', 400));
//     }

//     const start = new Date(startDate);
//     const end = new Date(endDate);
//     if (end < start) return next(new ErrorResponse('Invalid date range', 400));




//     let fileUrl: string | undefined;

//     if (req.file) {
//       // ❌ Only allow PDFs
//       if (req.file.mimetype !== 'application/pdf') {
//         return next(new ErrorResponse('Only PDF files are allowed', 400));
//       }

//       // ❌ Enforce size limit
//       if (req.file.size > MAX_PDF_SIZE) {
//         const maxSizeMB = (MAX_PDF_SIZE / (1024 * 1024)).toFixed(0);
//         const uploadedSizeMB = (req.file.size / (1024 * 1024)).toFixed(2);

//         return next(
//           new ErrorResponse(
//             `PDF file is too large (${uploadedSizeMB}MB). Maximum allowed size is ${maxSizeMB}MB.`,
//             400,
//           ),
//         );
//       }

//       // ✅ Upload if valid
//       const uploadedFile = await uploadToCloudinary(
//         req.file.buffer,
//         `leave/${company?._id}`,
//         'raw',
//         `leave_${req.user?.firstName}_${req.user?.lastName}_${Date.now()}.pdf`,
//       );

//       fileUrl = uploadedFile.secure_url;
//     }

//         // Get or initialize leave balance
//     let balance = await LeaveBalance.findOne({ user: userId, year: new Date().getFullYear() });
//     if (!balance) balance = await LeaveBalance.create({ user: userId, company: company?._id });

//     if (days > balance.balances[type]) {
//       return next(
//         new ErrorResponse(
//           `Insufficient ${type} leave balance. You only have ${balance.balances[type]} days left.`,
//           400,
//         ),
//       );
//     }

//     // Deduct leave immediately
//     balance.balances[type] -= days;
//     await balance.save();

//     let relieversWithNames: any[] = [];
//     let reviewLevels: string[] = [];

//     // if (userRole !== 'teamlead') {
//     //   // Staff must provide 2-3 relievers
//     // } else {
//     //   // Teamlead leave → no relievers
//     //   reviewLevels = ['hr', 'md'];
//     // }
//     if (!relieverEmails || relieverEmails.length < 2 || relieverEmails.length > 3) {
//       return next(new ErrorResponse('You must provide 2 or 3 relievers', 400));
//     }

//     const relieverUsers = (await userModel.find({ email: { $in: relieverEmails } })) as IUser[];
//     if (relieverUsers.length < 2 || relieverUsers.length > 3) {
//       return next(new ErrorResponse('Some relievers are invalid', 400));
//     }

//     relieversWithNames = relieverUsers.map((reliever) => ({
//       user: reliever._id,
//       firstName: reliever.firstName,
//       lastName: reliever.lastName,
//     }));

//     reviewLevels = [...relieversWithNames.map(() => 'reliever'), 'teamlead', 'hr', 'md'];

//     // Notify relievers
//     await Promise.all(
//       relieverUsers.map(async (reliever) => {
//         try {
//           await sendNotification({
//             user: reliever,
//             type: 'NEW_LEAVE_REQUEST',
//             title: 'Leave Request Requires Your Review',
//             message: `${req.user?.firstName} submitted a ${type} leave from ${startDate} to ${endDate}. You are listed as a reliever.`,
//             emailSubject: 'Leave Request to Review',
//             emailTemplate: 'leave-review-request.ejs',
//             emailData: {
//               reviewerName: reliever.firstName,
//               employeeName: req.user?.firstName,
//               type,
//               startDate,
//               endDate,
//               daysCount: days,
//               companyName: company?.branding?.displayName || company?.name,
//               logoUrl: company?.branding?.logoUrl,
//               primaryColor: company?.branding?.primaryColor || '#0621b6b0',
//             },
//           });
//         } catch {}
//       }),
//     );

//     // Create leave request
//     const leave = await LeaveRequest.create({
//       user: userId,
//       teamlead: teamleadId,
//       relievers: relieversWithNames,
//       type,
//       startDate: start,
//       endDate: end,
//       days: Number(days),
//       reason,
//       status: 'Pending',
//       reviewLevels,
//       typeIdentify,
//       allowance: allowance === 'yes',
//       url: fileUrl,
//       reviewTrail: [],
//     });

//     // Audit log
//     await logAudit({
//       userId,
//       action: 'CREATE_LEAVE_REQUEST',
//       status: 'SUCCESS',
//       ip: req.ip,
//       userAgent: req.get('user-agent'),
//     });

//     res.status(201).json({
//       success: true,
//       message: 'Leave request submitted',
//       data: { data: leave },
//     });
//   },
// );


// export const approveLeaveRequest = asyncHandler(
//   async (req: TypedRequest<{ id?: string }, {}, {}>, res: any, next: NextFunction) => {
//     try {
//       const leaveId = req.params.id;
//       const reviewer = req.user!;
//       const reviewerId = reviewer._id as Types.ObjectId;
//       const company = req.company;

//       const leave = await LeaveRequest.findById(leaveId).populate<{ user: IUser }>('user');

//       if (!leave) return next(new ErrorResponse('Leave not found', 404));
//       if (leave.status !== 'Pending') return next(new ErrorResponse('Leave already reviewed', 400));

//       const completedReviews = leave.reviewTrail?.length || 0;
      
//       const currentLevel = leave.reviewLevels[completedReviews];
//       const relievers = leave.relievers || [];

//       // ✅ Add approval record for reliever
//       if (currentLevel === 'reliever') {
//         const reliever = relievers.find((r) => r.user.toString() === reviewerId.toString());
//         if (reliever) {
//           reliever.status = 'Approved';
//           reliever.creactedAt = new Date();
//         }
//       }

//       leave.reviewTrail.push({
//         reviewer: reviewerId,
//         role: currentLevel,
//         action: 'Approved',
//         date: new Date(),
//       });

//       // ✅ Update leave status if last stage
//       const isLastStage = completedReviews + 1 === leave.reviewLevels.length;
//       if (isLastStage) {
//         leave.status = 'Approved';
//         leave.isActive = true;
//       }

//       await LeaveRequest.updateOne({ _id: leaveId }, leave);

//       // ✅ Send notifications
//       if (isLastStage) {
//         // Notify employee
//         await sendNotification({
//           user: leave.user,
//           type: 'LEAVE_APPROVED',
//           title: 'Leave Approved ✅',
//           message: `Your ${leave.type} leave has been fully approved.`,
//           emailSubject: 'Leave Approved',
//           emailTemplate: 'leave-approved.ejs',
//           emailData: {
//             name: leave.user.firstName,
//             type: leave.type,
//             startDate: leave.startDate,
//             endDate: leave.endDate,
//             days: leave.days,
//             companyName: company?.branding?.displayName || company?.name,
//             logoUrl: company?.branding?.logoUrl,
//             primaryColor: company?.branding?.primaryColor || '#0621b6b0',
//           },
//         });
//       } else {
//         // Notify next reviewer
//         const nextLevel = leave.reviewLevels[completedReviews + 1];

//         if (nextLevel === 'reliever') {
//           const nextReliever = relievers.find((r) => r.status === 'Pending');
//           if (nextReliever) {
//             const userNext = await userModel.findById(nextReliever.user);
//             if (userNext) {
//               await sendNotification({
//                 user: userNext,
//                 type: 'LEAVE_AWAITING_REVIEW',
//                 title: 'Leave Awaiting Review',
//                 message: `${leave.user.firstName}'s ${leave.type} leave is pending your review.`,
//                 emailSubject: 'Leave Approval Needed',
//                 emailTemplate: 'leave-review-request.ejs',
//                 emailData: {
//                   reviewerName: userNext.firstName,
//                   employeeName: leave.user.firstName,
//                   type: leave.type,
//                   startDate: leave.startDate,
//                   endDate: leave.endDate,
//                   days: leave.days,
//                   companyName: company?.branding?.displayName || company?.name,
//                   logoUrl: company?.branding?.logoUrl,
//                   primaryColor: company?.branding?.primaryColor || '#0621b6b0',
//                 },
//               });
//             }
//           }
//         } else {
//           const nextReviewer =
//             nextLevel === 'teamlead'
//               ? await userModel.findById(leave.teamlead)
//               : await userModel.findOne({ role: 'hr', company: reviewer.company });

//           if (nextReviewer) {
//             await sendNotification({
//               user: nextReviewer,
//               type: 'LEAVE_AWAITING_REVIEW',
//               title: 'Leave Awaiting Review',
//               message: `${leave.user.firstName}'s ${leave.type} leave is pending your review.`,
//               emailSubject: 'Leave Approval Needed',
//               emailTemplate: 'leave-review-request.ejs',
//               emailData: {
//                 reviewerName: nextReviewer.firstName,
//                 employeeName: leave.user.firstName,
//                 type: leave.type,
//                 startDate: leave.startDate,
//                 endDate: leave.endDate,
//                 days: leave.days,
//                 companyName: company?.branding?.displayName || company?.name,
//                 logoUrl: company?.branding?.logoUrl,
//                 primaryColor: company?.branding?.primaryColor || '#0621b6b0',
//               },
//             });
//           }
//         }
//       }

//       await logAudit({
//         userId: reviewerId,
//         action: 'APPROVE_LEAVE_REQUEST',
//         status: 'SUCCESS',
//         ip: req.ip,
//         userAgent: req.get('user-agent'),
//       });

//       res.status(200).json({
//         success: true,
//         message: isLastStage ? 'Leave fully approved' : 'Leave approved at current stage',
//         data: { data: leave },
//       });
//     } catch (err: any) {
//       next(new ErrorResponse(err.message, 500));
//     }
//   },
// );

// export const approveLeaveRequest = asyncHandler(
//   async (req: TypedRequest<{ id?: string }, {}, {}>, res: any, next: NextFunction) => {
//     try {
//       const leaveId = req.params.id;
//       const reviewer = req.user!;
//       const reviewerId = reviewer._id as Types.ObjectId;
//       const company = req.company;

//       const leave = await LeaveRequest.findById(leaveId).populate<{ user: IUser }>('user');

//       if (!leave) return next(new ErrorResponse('Leave not found', 404));
//       // if (leave.status !== 'Pending') return next(new ErrorResponse('Leave already reviewed', 400));
//       const alreadyReviewedByThisUser = leave.reviewTrail?.some(
//         (r) => r.reviewer?.toString() === reviewerId.toString()
//       );



//       if (alreadyReviewedByThisUser) {
//         return next(new ErrorResponse('You have already reviewed this leave', 400));
//       }


//       const completedReviews = leave.reviewTrail?.length || 0;
//       const currentLevel = leave.reviewLevels[completedReviews];
//       const relievers = leave.relievers || [];

//       // ✅ Approve reliever
//       if (currentLevel === 'reliever') {
//         const reliever = relievers.find((r) => r.user.toString() === reviewerId.toString());
//         if (reliever) {
//           reliever.status = 'Approved';
//           reliever.creactedAt = new Date();
//         }
//       }

//       // ✅ Add to review trail
//       leave.reviewTrail.push({
//         reviewer: reviewerId,
//         role: currentLevel,
//         action: 'Approved',
//         date: new Date(),
//       });

//       // ✅ Update leave status if last stage
//       const isLastStage = completedReviews + 1 === leave.reviewLevels.length;

//       // ✅ HR approval → employee-visible approval
//       if (currentLevel === 'hr') {
//         leave.status = 'Approved';
//         leave.isActive = true;
//       }

//       if (isLastStage) {
//         leave.status = 'Approved';
//         leave.isActive = true;
//       }

//       await LeaveRequest.updateOne({ _id: leaveId }, leave);

//       // ✅ Send notifications
//       if (isLastStage) {
//         // Notify employee of full approval
//         await sendNotification({
//           user: leave.user,
//           type: 'LEAVE_APPROVED',
//           title: 'Leave Approved ✅',
//           message: `Your ${leave.type} leave has been fully approved.`,
//           emailSubject: 'Leave Approved',
//           emailTemplate: 'leave-approved.ejs',
//           emailData: {
//             name: leave.user.firstName,
//             type: leave.type,
//             startDate: leave.startDate,
//             endDate: leave.endDate,
//             days: leave.days,
//             companyName: company?.branding?.displayName || company?.name,
//             logoUrl: company?.branding?.logoUrl,
//             primaryColor: company?.branding?.primaryColor || '#0621b6b0',
//           },
//         });
//       } else {
//         // Notify next reviewer
//         const nextLevel = leave.reviewLevels[completedReviews + 1];
//         let nextReviewer;

//         if (nextLevel === 'reliever') {
//           const nextReliever = relievers.find((r) => r.status === 'Pending');
//           if (nextReliever) nextReviewer = await userModel.findById(nextReliever.user);
//         } else if (nextLevel === 'teamlead') {
//           nextReviewer = await userModel.findById(leave.teamlead);
//         } else if (nextLevel === 'hr') {
//           nextReviewer = await userModel.findOne({ role: 'hr', company: reviewer.company });
//         } else if (nextLevel === 'md') {
//           nextReviewer = await userModel.findOne({ role: 'md', company: reviewer.company });
//         } else {
//           nextReviewer = null;
//         }
        

//         if (nextReviewer) {
//           await sendNotification({
//             user: nextReviewer,
//             type: 'LEAVE_AWAITING_REVIEW',
//             title: 'Leave Awaiting Review',
//             message: `${leave.user.firstName}'s ${leave.type} leave is pending your review.`,
//             emailSubject: 'Leave Approval Needed',
//             emailTemplate: 'leave-review-request.ejs',
//             emailData: {
//               reviewerName: nextReviewer.firstName,
//               employeeName: leave.user.firstName,
//               type: leave.type,
//               startDate: leave.startDate,
//               endDate: leave.endDate,
//               days: leave.days,
//               companyName: company?.branding?.displayName || company?.name,
//               logoUrl: company?.branding?.logoUrl,
//               primaryColor: company?.branding?.primaryColor || '#0621b6b0',
//             },
//           });
//         }
//       }

//       // ✅ Audit log
//       await logAudit({
//         userId: reviewerId,
//         action: 'APPROVE_LEAVE_REQUEST',
//         status: 'SUCCESS',
//         ip: req.ip,
//         userAgent: req.get('user-agent'),
//       });

//       res.status(200).json({
//         success: true,
//         message: isLastStage ? 'Leave fully approved' : 'Leave approved at current stage',
//         data: { data: leave },
//       });
//     } catch (err: any) {
//       next(new ErrorResponse(err.message, 500));
//     }
//   },
// );

export const approveLeaveRequest = asyncHandler(
  async (req: TypedRequest<{ id?: string }, {}, {}>, res: any, next: NextFunction) => {
    try {
      const leaveId = req.params.id;
      const reviewer = req.user!;
      const reviewerId = reviewer._id as Types.ObjectId;
      const company = req.company;

      const leave = await LeaveRequest.findById(leaveId).populate<{ user: IUser }>('user');
      if (!leave) return next(new ErrorResponse('Leave not found', 404));

      const alreadyReviewed = leave.reviewTrail.some(
        (r) => r.reviewer?.toString() === reviewerId.toString()
      );
      if (alreadyReviewed) {
        return next(new ErrorResponse('You have already reviewed this leave', 400));
      }

      const completedReviews = leave.reviewTrail.length;
      const currentLevel = leave.reviewLevels[completedReviews];
      const relievers = leave.relievers || [];

      // RELIEVER APPROVAL
      if (currentLevel === 'reliever') {
        const reliever = relievers.find((r) => r.user.toString() === reviewerId.toString());
        if (reliever) {
          reliever.status = 'Approved';
          reliever.creactedAt = new Date();
        }
      }

      // ADD TO TRAIL
      leave.reviewTrail.push({
        reviewer: reviewerId,
        role: currentLevel,
        action: 'Approved',
        date: new Date(),
      });

      // CHECK IF LAST STAGE
      const isLastStage = completedReviews + 1 === leave.reviewLevels.length;

      // HR APPROVAL (visible to employee)
      if (currentLevel === 'hr') {
        leave.status = 'Approved';
        leave.isActive = true;
      }

      // FINAL APPROVAL
      if (isLastStage) {
        leave.status = 'Approved';
        leave.isActive = true;
      }

      // SAVE CHANGES
      await leave.save();

      // NOTIFICATIONS
      if (isLastStage) {
        // Notify employee
        await sendNotification({
          user: leave.user,
          type: 'LEAVE_APPROVED',
          title: 'Leave Approved',
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
            logoUrl: company?.branding?.logoUrl,
            primaryColor: company?.branding?.primaryColor || '#0621b6b0',
          },
        });
      } else {
        // Notify next reviewer
        const nextLevel = leave.reviewLevels[completedReviews + 1];
        let nextReviewer = null;

        if (nextLevel === 'reliever') {
          const nextReliever = relievers.find((r) => r.status === 'Pending');
          if (nextReliever) nextReviewer = await userModel.findById(nextReliever.user);
        } else if (nextLevel === 'teamlead') {
          nextReviewer = await userModel.findById(leave.teamlead);
        } else if (nextLevel === 'hr') {
          nextReviewer = await userModel.findOne({ role: 'hr', company: reviewer.company });
        } else if (nextLevel === 'md') {
          nextReviewer = await userModel.findOne({ role: 'md', company: reviewer.company });
        }

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
              logoUrl: company?.branding?.logoUrl,
              primaryColor: company?.branding?.primaryColor || '#0621b6b0',
            },
          });
        }
      }

      // AUDIT LOG
      await logAudit({
        userId: reviewerId,
        action: 'APPROVE_LEAVE_REQUEST',
        status: 'SUCCESS',
        ip: req.ip,
        userAgent: req.get('user-agent'),
      });

      res.status(200).json({
        success: true,
        message: isLastStage ? 'Leave fully approved' : 'Leave approved at current stage',
        data: { data: leave },
      });
    } catch (err: any) {
      next(new ErrorResponse(err.message, 500));
    }
  },
);


// export const rejectLeaveRequest = asyncHandler(
//   async (req: TypedRequest<{ id?: string }, {}, {}>, res: any, next: NextFunction) => {
//     try {
//       const leaveId = req.params.id;
//       const reviewer = req.user!;
//       const reviewerId = reviewer._id as Types.ObjectId;
//       const company = req.company;

//       const leave = await LeaveRequest.findById(leaveId).populate<{ user: IUser }>('user');

//       if (!leave) return next(new ErrorResponse('Leave not found', 404));
//       if (leave.status !== 'Pending') return next(new ErrorResponse('Leave already reviewed', 400));

//       const completedReviews = leave.reviewTrail?.length || 0;
//       const currentLevel = leave.reviewLevels[completedReviews];
//       const relievers = leave.relievers || [];

//       // ✅ Add rejection record for reliever
//       if (currentLevel === 'reliever') {
//         const reliever = relievers.find((r) => r.user.toString() === reviewerId.toString());
//         if (reliever) {
//           reliever.status = 'Rejected';
//           reliever.creactedAt = new Date();
//         }
//       }

//       leave.reviewTrail.push({
//         reviewer: reviewerId,
//         role: currentLevel,
//         action: 'Rejected',
//         date: new Date(),
//       });

//       // ✅ Update leave status if last stage
//       leave.status = 'Rejected';

//       await LeaveRequest.updateOne({ _id: leaveId }, leave);

//       // ✅ Notify employee
//       await sendNotification({
//         user: leave.user,
//         type: 'LEAVE_REJECTED',
//         title: 'Leave Rejected ❌',
//         message: `Your ${leave.type} leave has been rejected at the current review stage.`,
//         emailSubject: 'Leave Rejected',
//         emailTemplate: 'leave-rejected.ejs',
//         emailData: {
//           name: leave.user.firstName,
//           type: leave.type,
//           startDate: leave.startDate,
//           endDate: leave.endDate,
//           days: leave.days,
//           companyName: company?.branding?.displayName || company?.name,
//           logoUrl: company?.branding?.logoUrl,
//           primaryColor: company?.branding?.primaryColor || '#0621b6b0',
//         },
//       });

//       await logAudit({
//         userId: reviewerId,
//         action: 'REJECT_LEAVE_REQUEST',
//         status: 'SUCCESS',
//         ip: req.ip,
//         userAgent: req.get('user-agent'),
//       });

//       res.status(200).json({
//         success: true,
//         message: 'Leave rejected',
//         data: { data: leave },
//       });
//     } catch (err: any) {
//       next(new ErrorResponse(err.message, 500));
//     }
//   },
// );

export const rejectLeaveRequest = asyncHandler(
  async (req: TypedRequest<{ id?: string }, {}, {}>, res: any, next: NextFunction) => {
    try {
      const leaveId = req.params.id;
      const reviewer = req.user!;
      const reviewerId = reviewer._id as Types.ObjectId;
      const company = req.company;

      const leave = await LeaveRequest.findById(leaveId).populate<{ user: IUser }>('user');
      if (!leave) return next(new ErrorResponse('Leave not found', 404));

      const alreadyReviewed = leave.reviewTrail.some(
        (r) => r.reviewer?.toString() === reviewerId.toString()
      );
      if (alreadyReviewed) {
        return next(new ErrorResponse('You have already reviewed this leave', 400));
      }

      const completedReviews = leave.reviewTrail.length;
      const currentLevel = leave.reviewLevels[completedReviews];
      const relievers = leave.relievers || [];

      // RELIEVER REJECTION
      if (currentLevel === 'reliever') {
        const reliever = relievers.find((r) => r.user.toString() === reviewerId.toString());
        if (reliever) {
          reliever.status = 'Rejected';
          reliever.creactedAt = new Date();
        }
      }

      // ADD TO TRAIL
      leave.reviewTrail.push({
        reviewer: reviewerId,
        role: currentLevel,
        action: 'Rejected',
        date: new Date(),
      });

      // CORRECT LAST-STAGE DETECTION
      const isLastStage = completedReviews + 1 === leave.reviewLevels.length;

      if (isLastStage) {
        leave.status = 'Rejected';
      }

      // SAVE SAFELY
      await leave.save();

      // NOTIFY EMPLOYEE
      await sendNotification({
        user: leave.user,
        type: 'LEAVE_REJECTED',
        title: 'Leave Rejected ❌',
        message: `Your ${leave.type} leave has been rejected at the ${currentLevel} review stage.`,
        emailSubject: 'Leave Rejected',
        emailTemplate: 'leave-rejected.ejs',
        emailData: {
          name: leave.user.firstName,
          type: leave.type,
          startDate: leave.startDate,
          endDate: leave.endDate,
          days: leave.days,
          companyName: company?.branding?.displayName || company?.name,
          logoUrl: company?.branding?.logoUrl,
          primaryColor: company?.branding?.primaryColor || '#0621b6b0',
        },
      });

      // AUDIT LOG
      await logAudit({
        userId: reviewerId,
        action: 'REJECT_LEAVE_REQUEST',
        status: 'SUCCESS',
        ip: req.ip,
        userAgent: req.get('user-agent'),
      });

      res.status(200).json({
        success: true,
        message: 'Leave rejected',
        data: { data: leave },
      });
    } catch (err: any) {
      next(new ErrorResponse(err.message, 500));
    }
  },
);


// export const rejectLeaveRequest = asyncHandler(
//   async (req: TypedRequest<{ id?: string }, {}, {}>, res: any, next: NextFunction) => {
//     try {
//       const leaveId = req.params.id;
//       const reviewer = req.user!;
//       const reviewerId = reviewer._id as Types.ObjectId;
//       const company = req.company;

//       const leave = await LeaveRequest.findById(leaveId).populate<{ user: IUser }>('user');
//       if (!leave) return next(new ErrorResponse('Leave not found', 404));
//       // if (leave.status !== 'Pending') return next(new ErrorResponse('Leave already reviewed', 400));
//       const alreadyReviewedByThisUser = leave.reviewTrail?.some(
//         (r) => r.reviewer?.toString() === reviewerId.toString()
//       );



//       if (alreadyReviewedByThisUser) {
//         return next(new ErrorResponse('You have already reviewed this leave', 400));
//       }


//       const completedReviews = leave.reviewTrail?.length || 0;
//       const currentLevel = leave.reviewLevels[completedReviews];
//       const relievers = leave.relievers || [];

//       // ✅ Reject reliever if current stage
//       if (currentLevel === 'reliever') {
//         const reliever = relievers.find((r) => r.user.toString() === reviewerId.toString());
//         if (reliever) {
//           reliever.status = 'Rejected';
//           reliever.creactedAt = new Date();
//         }
//       }

//       // ✅ Push rejection to review trail
//       leave.reviewTrail.push({
//         reviewer: reviewerId,
//         role: currentLevel,
//         action: 'Rejected',
//         date: new Date(),
//       });

//       // ✅ Determine if this is final stage (MD for teamlead leave counts as final)
//       const isLastStage =
//         completedReviews + 1 === leave.reviewLevels.length ||
//         (currentLevel === 'md' && leave.reviewLevels.includes('md'));

//       if (isLastStage) {
//         leave.status = 'Rejected';
//       }

//       await LeaveRequest.updateOne({ _id: leaveId }, leave);

//       // ✅ Notify employee
//       await sendNotification({
//         user: leave.user,
//         type: 'LEAVE_REJECTED',
//         title: 'Leave Rejected ❌',
//         message: `Your ${leave.type} leave has been rejected at the ${currentLevel} review stage.`,
//         emailSubject: 'Leave Rejected',
//         emailTemplate: 'leave-rejected.ejs',
//         emailData: {
//           name: leave.user.firstName,
//           type: leave.type,
//           startDate: leave.startDate,
//           endDate: leave.endDate,
//           days: leave.days,
//           companyName: company?.branding?.displayName || company?.name,
//           logoUrl: company?.branding?.logoUrl,
//           primaryColor: company?.branding?.primaryColor || '#0621b6b0',
//         },
//       });

//       await logAudit({
//         userId: reviewerId,
//         action: 'REJECT_LEAVE_REQUEST',
//         status: 'SUCCESS',
//         ip: req.ip,
//         userAgent: req.get('user-agent'),
//       });

//       res.status(200).json({
//         success: true,
//         message: 'Leave rejected',
//         data: { data: leave },
//       });
//     } catch (err: any) {
//       next(new ErrorResponse(err.message, 500));
//     }
//   },
// );


// export const getLeaveApprovalQueue = asyncHandler(
//   async (
//     req: TypedRequest<{}, {}, {}>,
//     res: TypedResponse<{ data: ILeaveRequest[] }>,
//     next: NextFunction,
//   ) => {
//     try {
//       const userRole = req.user?.role!;
//       const userId = req.user?._id;

//       if (!userRole || !userId) {
//         res.status(200).json({ success: true, data: { data: [] } });
//         return;
//       }

//       // Pull all pending leaves
//       const leaves: ILeaveRequest[] = await LeaveRequest.find({ status: 'Pending' })
//         .populate('user', 'staffId firstName lastName email')
//         .sort({ createdAt: -1 });

//       const queue: ILeaveRequest[] = leaves.filter((leave) => {
//         const completedReviews = leave.reviewTrail?.length || 0;
//         const currentLevel = leave.reviewLevels[completedReviews];

//        const isTeamLeadLeave = !leave.reviewLevels.includes('teamlead');

//         if (currentLevel === 'reliever') {
//           return leave.relievers?.some(
//             (r) => r.user.toString() === userId.toString() && r.status === 'Pending',
//           );
//         }

// // =========================
//         // TEAMLEAD STAGE
//         // (staff leaves ONLY)
//         // =========================
//         if (currentLevel === 'teamlead') {
//           if (isTeamLeadLeave) return false; // 🚫 teamlead must never see own leave

//           const allRelieversApproved = leave.relievers?.every(
//             (r) => r.status === 'Approved',
//           );

//           return (
//             allRelieversApproved &&
//             leave.teamlead.toString() === userId.toString()
//           );
//         }

//         // =========================
//         // HR STAGE
//         // =========================
//         if (currentLevel === 'hr') {
//           // Teamlead-created leave → HR is first reviewer
//           if (isTeamLeadLeave) {
//             return userRole === 'hr';
//           }

//           // Staff leave → teamlead must have approved
//           const teamleadApproved = leave.reviewTrail?.some(
//             (r) => r.role === 'teamlead' && r.action === 'Approved',
//           );

//           return teamleadApproved && userRole === 'hr';
//         }

//         // =========================
//         // MD STAGE
//         // =========================

//         // =========================

// if (currentLevel === 'md') {
//   const hrApproved = leave.reviewTrail?.some(
//     (r) => r.role === 'hr' && r.action === 'Approved'
//   );

//   return hrApproved && userRole === 'md';
// }


//       //    if (currentLevel === 'md' && isTeamLeadLeave) {

//       //   const hrApproved = leave.reviewTrail?.some(
//       //     (r) => r.role === 'hr' && r.action === 'Approved'
//       //   );

//       //   return hrApproved && userRole === 'md';
//       // }

        

//         return false;
//       });

//       res.status(200).json({ success: true, data: { data: queue } });
//     } catch (err) {
//       next(err);
//     }
//   },
// );

export const getLeaveApprovalQueue = asyncHandler(
  async (
    req: TypedRequest<{}, {}, {}>,
    res: TypedResponse<{ data: ILeaveRequest[] }>,
    next: NextFunction,
  ) => {
    try {
      const userRole = req.user?.role!;
      const userId = req.user?._id;

      if (!userRole || !userId) {
        res.status(200).json({ success: true, data: { data: [] } });
        return;
      }

      const leaves: ILeaveRequest[] = await LeaveRequest.find({ status: 'Pending' })
        .populate('user', 'staffId firstName lastName email')
        .sort({ createdAt: -1 });

      const queue: ILeaveRequest[] = leaves.filter((leave) => {
        const completedReviews = leave.reviewTrail?.length || 0;
        const currentLevel = leave.reviewLevels[completedReviews];

        // ⭐ Correct teamlead-leave detection
        const isTeamLeadLeave = leave.reviewLevels[2] !== 'teamlead';

        const relievers = leave.relievers || [];

        // =========================
        // RELIEVER STAGE
        // =========================
        if (currentLevel === 'reliever') {
          return relievers.some(
            (r) => r.user.toString() === userId.toString() && r.status === 'Pending',
          );
        }

        // =========================
        // TEAMLEAD STAGE (EMPLOYEE ONLY)
        // =========================
        if (currentLevel === 'teamlead') {
          if (isTeamLeadLeave) return false;

          const allRelieversApproved = relievers.every((r) => r.status === 'Approved');

          return (
            allRelieversApproved &&
            leave.teamlead.toString() === userId.toString()
          );
        }

        // =========================
        // HR STAGE
        // =========================
        if (currentLevel === 'hr') {
          if (userRole !== 'hr') return false;

          if (isTeamLeadLeave) {
            const relieversApproved = relievers.every((r) => r.status === 'Approved');
            return relieversApproved;
          }

          const teamleadApproved = leave.reviewTrail.some(
            (r) => r.role === 'teamlead' && r.action === 'Approved',
          );

          return teamleadApproved;
        }

        // =========================
        // MD STAGE
        // =========================
        if (currentLevel === 'md') {
          const hrApproved = leave.reviewTrail.some(
            (r) => r.role === 'hr' && r.action === 'Approved'
          );

          return hrApproved && userRole === 'md';
        }

        return false;
      });

      res.status(200).json({ success: true, data: { data: queue } });
    } catch (err) {
      next(err);
    }
  },
);


// export const getLeaveApprovalQueue = asyncHandler(
//   async (
//     req: TypedRequest<{}, {}, {}>,
//     res: TypedResponse<{ data: ILeaveRequest[] }>,
//     next: NextFunction,
//   ) => {
//     try {
//       const userRole = req.user?.role!;
//       const userId = req.user?._id;

//       if (!userRole || !userId) {
//         res.status(200).json({ success: true, data: { data: [] } });
//         return;
//       }

//       // Pull all pending leaves
//       const leaves: ILeaveRequest[] = await LeaveRequest.find({ status: 'Pending' })
//         .populate('user', 'staffId firstName lastName email')
//         .sort({ createdAt: -1 });

//       const queue: ILeaveRequest[] = leaves.filter((leave) => {
//         const completedReviews = leave.reviewTrail?.length || 0;
//         const currentLevel = leave.reviewLevels[completedReviews];

//         const isTeamLeadLeave = !leave.reviewLevels.includes('teamlead');

//         if (currentLevel === 'reliever') {
//           return leave.relievers?.some(
//             (r) => r.user.toString() === userId.toString() && r.status === 'Pending',
//           );
//         }

//         // =========================
//         // TEAMLEAD STAGE
//         // (staff leaves ONLY)
//         // =========================
//         if (currentLevel === 'teamlead') {
//           if (isTeamLeadLeave) return false; // 🚫 teamlead must never see own leave

//           const allRelieversApproved = leave.relievers?.every(
//             (r) => r.status === 'Approved',
//           );

//           return (
//             allRelieversApproved &&
//             leave.teamlead.toString() === userId.toString()
//           );
//         }

//         // =========================
//         // HR STAGE
//         // =========================
//         if (currentLevel === 'hr') {
//           if (userRole !== 'hr') return false;

//           // Teamlead-created leave → HR after both relievers approve
//           if (isTeamLeadLeave) {
//             const relieversApproved = leave.relievers?.every(
//               (r) => r.status === 'Approved',
//             );
//             return !!relieversApproved;
//           }

//           // Staff leave → teamlead must have approved
//           const teamleadApproved = leave.reviewTrail?.some(
//             (r) => r.role === 'teamlead' && r.action === 'Approved',
//           );

//           return !!teamleadApproved;
//         }

//         // =========================
//         // MD STAGE
//         // =========================

//         if (currentLevel === 'md') {
//           const hrApproved = leave.reviewTrail?.some(
//             (r) => r.role === 'hr' && r.action === 'Approved'
//           );

//           return hrApproved && userRole === 'md';
//         }

//         return false;
//       });

//       res.status(200).json({ success: true, data: { data: queue } });
//     } catch (err) {
//       next(err);
//     }
//   },
// );



// export const getLeaveApprovalQueue = asyncHandler(
//   async (
//     req: TypedRequest<{}, {}, {}>,
//     res: TypedResponse<{ data: ILeaveRequest[] }>,
//     next: NextFunction,
//   ) => {
//     try {
//       const userRole = req.user?.role!;
//       const userId = req.user?._id;

//       if (!userRole || !userId) {
//         res.status(200).json({ success: true, data: { data: [] } });
//         return;
//       }

//       // Pull all pending leaves
//       const leaves: ILeaveRequest[] = await LeaveRequest.find({ status: 'Pending' })
//         .populate('user', 'staffId firstName lastName email')
//         .sort({ createdAt: -1 });

//       const queue: ILeaveRequest[] = leaves.filter((leave) => {
//         const completedReviews = leave.reviewTrail?.length || 0;
//         const currentLevel = leave.reviewLevels[completedReviews];

//         const isTeamLeadLeave = leave.relievers?.length === 0 && leave.reviewLevels[0] === 'hr';

//         if (currentLevel === 'reliever') {
//           return leave.relievers?.some(
//             (r) => r.user.toString() === userId.toString() && r.status === 'Pending',
//           );
//         }

//         if (currentLevel === 'teamlead' && !isTeamLeadLeave) {
//           const allRelieversApproved = leave.relievers?.every((r) => r.status === 'Approved');
//           return allRelieversApproved && leave.teamlead.toString() === userId.toString();
//         }

        

//         if (currentLevel === 'hr') {
//           const allRelieversApproved = leave.relievers?.every((r) => r.status === 'Approved');
//           const teamleadApproved = leave.reviewTrail?.some(
//             (r) => r.role === 'teamlead' && r.action === 'Approved',
//           );
//           return allRelieversApproved && teamleadApproved && userRole === 'hr';
//         }


//         if (currentLevel === 'md') {
//           const hrApproved = leave.reviewTrail?.some(
//             (r) => r.role === 'hr' && r.action === 'Approved',
//           );

//           const isTeamLeadLeave = !leave.reviewTrail?.some(
//             (r) => r.role === 'teamlead',
//           );

//           return hrApproved && isTeamLeadLeave && userRole === 'md';
//         }

        

//         return false;
//       });

//       res.status(200).json({ success: true, data: { data: queue } });
//     } catch (err) {
//       next(err);
//     }
//   },
// );

// export const getLeaveActivityFeed = asyncHandler(
//   async (req: TypedRequest<{}, TypedRequestQuery, {}>, res: any, _next: NextFunction) => {
//     const userId = req.user?._id as Types.ObjectId;
//     const userRole = req.user?.role;
//     const { status, from, to, page = '1', limit = '20' } = req.query;

//     if (!userId) {
//       return res.status(401).json({ success: false, message: 'User not authenticated' });
//     }

//     const pageNum = parseInt(page, 10);
//     const pageSize = parseInt(limit, 10);
//     const skip = (pageNum - 1) * pageSize;

//     // 🔹 1) Base filter
//     const baseFilter: any = {};
//     if (status) {
//       baseFilter.status = {
//         $in: [status, String(status).charAt(0).toUpperCase() + String(status).slice(1)],
//       };
//     }
//     if (from || to) {
//       baseFilter.createdAt = {};
//       if (from) baseFilter.createdAt.$gte = new Date(from);
//       if (to) baseFilter.createdAt.$lte = new Date(to);
//     }

//     // 🔹 2) My own requests (with pagination)
//     const [myRequestsRaw, myTotal] = await Promise.all([
//       LeaveRequest.find({
//         ...baseFilter,
//         user: userId,
//       })
//         .sort({ createdAt: -1 })
//         .skip(skip)
//         .limit(pageSize)
//         .select(
//           '_id type startDate endDate days status reason createdAt user teamlead reviewLevels reviewTrail relievers allowance url',
//         )
//         .populate('user', 'staffId firstName lastName department')
//         .lean(),
//       LeaveRequest.countDocuments({ ...baseFilter, user: userId }),
//     ]);

//     // 🔹 3) Approvals (reliever/teamlead/hr)
//     const roleConditions: any[] = [];

//     // (a) Reliever stage
//     roleConditions.push({
//       relievers: {
//         $elemMatch: {
//           user: userId,
//           status: { $in: ['Pending', 'pending'] },
//         },
//       },
//       status: { $nin: ['Rejected', 'rejected'] },
//     });

//     // (b) Teamlead stage
//     roleConditions.push({
//       teamlead: userId,
//       status: { $in: ['Pending', 'pending'] },
//       reviewLevels: { $ne: ['hr', 'md'] },
//       relievers: {
//         $not: {
//           $elemMatch: {
//             status: { $in: ['Pending', 'pending', 'Rejected', 'rejected'] },
//           },
//         },
//       },
//       $nor: [{ reviewTrail: { $elemMatch: { role: 'teamlead' } } }],
//     });

     
//     if (userRole === 'hr') {
//       roleConditions.push({
//         status: { $in: ['Pending', 'pending'] },

//         // HR must not have acted already
//         $nor: [{ reviewTrail: { $elemMatch: { role: 'hr' } } }],

//         $or: [
//           // ✅ Staff leave → teamlead approved
//           {
//             reviewTrail: {
//               $elemMatch: {
//                 role: 'teamlead',
//                 action: { $in: ['Approved', 'approved'] },
//               },
//             },
//           },

//           // ✅ Teamlead-created leave → HR is first reviewer
//           {
//             reviewLevels: ['hr', 'md'],
//           },
//         ],
//       });
//     }

//     if (userRole === 'md') {
//       roleConditions.push({
//         status: { $nin: ['Rejected', 'rejected'] },

//         $nor: [{ reviewTrail: { $elemMatch: { role: 'md' } } }],

//         $or: [
//           { user: userId },
//           {
//             reviewTrail: {
//               $elemMatch: {
//                 role: 'hr',
//                 action: { $in: ['Approved', 'approved'] },
//               },
//             },
//           },
//         ],
//       });
//     }


// //   if (userRole === 'md') {
// //   roleConditions.push({
// //     status: { $in: ['Pending', 'pending'] },

// //     $or: [
// //       // ✅ MD’s own leave
// //       {
// //         user: userId,
// //       },

// //       // ✅ Any leave already approved by HR (staff + teamlead)
// //       {
// //         reviewTrail: {
// //           $elemMatch: {
// //             role: 'hr',
// //             action: { $in: ['Approved', 'approved'] },
// //           },
// //         },
// //       },
// //     ],

// //     // MD must not have acted yet (still pending at MD level)
// //     $nor: [{ reviewTrail: { $elemMatch: { role: 'md' } } }],
// //   });
// // }



//     const [approvalsRaw, approvalsTotal] = await Promise.all([
//       LeaveRequest.find({
//         ...baseFilter,
//         $or: roleConditions,
//       })
//         .sort({ createdAt: -1 })
//         .skip(skip)
//         .limit(pageSize)
//         .select(
//           '_id type startDate endDate days status reason createdAt user teamlead reviewTrail reviewLevels relievers allowance url',
//         )
//         .populate('user', 'staffId firstName lastName department')
//         .lean(),
//       LeaveRequest.countDocuments({ ...baseFilter, $or: roleConditions }),
//     ]);

//     // 🔹 4) HR/Admin extra → fetch all APPROVED requests
//     let allApprovedRaw: any[] = [];
//     let allApprovedTotal = 0;

//     if (['hr', 'admin'].includes(userRole!)) {
//       const approvedFilter = {
//         ...baseFilter,
//         status: { $in: ['Approved', 'approved'] },
//       };

//       [allApprovedRaw, allApprovedTotal] = await Promise.all([
//         LeaveRequest.find(approvedFilter)
//           .sort({ createdAt: -1 })
//           .skip(skip)
//           .limit(pageSize)
//           .select(
//             '_id type startDate endDate days status reason createdAt user teamlead reviewTrail reviewLevels relievers allowance url',
//           )
//           .populate('user', 'staffId firstName lastName department')
//           .lean(),
//         LeaveRequest.countDocuments(approvedFilter),
//       ]);
//     }

//     // 🔹 5) Mapping helper
//     const mapLeave = (leave: any) => {
//       let currentReviewerRole: 'reliever' | 'teamlead' | 'hr' | 'md' | null = null;
//         const completedReviews = leave.reviewTrail?.length || 0;
//         currentReviewerRole = leave.reviewLevels?.[completedReviews] ?? null;

//       return {
//         id: leave._id.toString(),
//         employeeId: leave.user?._id?.toString() ?? '',
//         employeeName: `${leave.user?.firstName ?? ''} ${leave.user?.lastName ?? ''}`.trim(),
//         department: leave.user?.department,
//         type: leave.type,
//         staffId: leave.user?.staffId,
//         startDate: leave.startDate,
//         endDate: leave.endDate,
//         days: leave.days,
//         reason: leave.reason,
//         status: String(leave.status).toLowerCase(),
//         appliedDate: leave.createdAt,
//         teamleadId: leave.teamlead?.toString?.() ?? '',
//         teamleadName: '',
//         currentReviewerRole,
//         relievers: (leave.relievers ?? []).map((r: any) => ({
//           user: r.user?.toString?.() ?? '',
//           firstName: r.firstName,
//           lastName: r.lastName,
//           status: String(r.status ?? 'pending').toLowerCase(),
//           note: r.note ?? undefined,
//           actedAt: r.actedAt ?? undefined,
//         })),
//         reviewTrail: (leave.reviewTrail ?? []).map((r: any) => ({
//           reviewer: r.reviewer?.toString?.() ?? '',
//           role: r.role,
//           action: String(r.action).toLowerCase(),
//           date: r.date ? new Date(r.date).toISOString() : '',
//           note: r.note,
//         })),
//         allowance: !!leave.allowance,
//         url: leave.url ?? undefined,
//       };
//     };

//     // 🔹 6) Summary (only for my requests)
//     const allUserLeaves = await LeaveRequest.find({ user: userId }).select('status').lean();
//     const summary = {
//       pending: allUserLeaves.filter((l) => ['pending', 'Pending'].includes(l.status)).length,
//       approved: allUserLeaves.filter((l) => ['approved', 'Approved'].includes(l.status)).length,
//       rejected: allUserLeaves.filter((l) => ['rejected', 'Rejected'].includes(l.status)).length,
//       expired: allUserLeaves.filter((l) => ['expired', 'Expired'].includes(l.status)).length,
//     };

//     // 🔹 7) Leave balances
//     const year = new Date().getFullYear();
//     const leaveBalance = await LeaveBalance.findOne({ user: userId, year }).lean();
//     const balance = leaveBalance
//       ? Object.entries(leaveBalance.balances).map(([type, remaining]) => ({
//           type,
//           remaining,
//         }))
//       : Object.entries(LeaveEntitlements).map(([type, entitlement]) => ({
//           type,
//           remaining: entitlement,
//         }));

//     const payload: any = {
//       data: {
//         myRequests: myRequestsRaw.map(mapLeave),
//         approvals: approvalsRaw.map(mapLeave),
//         allApproved: allApprovedRaw.map(mapLeave),
//         pagination: {
//           myRequests: {
//             total: myTotal,
//             page: pageNum,
//             limit: pageSize,
//             pages: Math.ceil(myTotal / pageSize),
//           },
//           approvals: {
//             total: approvalsTotal,
//             page: pageNum,
//             limit: pageSize,
//             pages: Math.ceil(approvalsTotal / pageSize),
//           },
//           allApproved: {
//             total: allApprovedTotal,
//             page: pageNum,
//             limit: pageSize,
//             pages: Math.ceil(allApprovedTotal / pageSize),
//           },
//         },
//         summary,
//         balance,
//       },
//     };

    

//     emitToUser(userId, 'leave:update', payload.data);

//     res.status(200).json({
//       success: true,
//       data: payload.data,
//     });
//   },
// );
// export const getLeaveActivityFeed = asyncHandler(
//   async (req: TypedRequest<{}, TypedRequestQuery, {}>, res: any, _next: NextFunction) => {
//     const userId = req.user?._id as Types.ObjectId;
//     const userRole = req.user?.role;
//     const { status, from, to, page = '1', limit = '20' } = req.query;

//     if (!userId) {
//       return res.status(401).json({ success: false, message: 'User not authenticated' });
//     }

//     const pageNum = parseInt(page, 10);
//     const pageSize = parseInt(limit, 10);
//     const skip = (pageNum - 1) * pageSize;

//     // 🔹 1) Base filter
//     const baseFilter: any = {};
//     if (status) {
//       baseFilter.status = {
//         $in: [status, String(status).charAt(0).toUpperCase() + String(status).slice(1)],
//       };
//     }
//     if (from || to) {
//       baseFilter.createdAt = {};
//       if (from) baseFilter.createdAt.$gte = new Date(from);
//       if (to) baseFilter.createdAt.$lte = new Date(to);
//     }

//     // 🔹 2) My own requests
//     const [myRequestsRaw, myTotal] = await Promise.all([
//       LeaveRequest.find({
//         ...baseFilter,
//         user: userId,
//       })
//         .sort({ createdAt: -1 })
//         .skip(skip)
//         .limit(pageSize)
//         .select(
//           '_id type startDate endDate days status reason createdAt user teamlead reviewLevels reviewTrail relievers allowance url',
//         )
//         .populate('user', 'staffId firstName lastName department')
//         .lean(),
//       LeaveRequest.countDocuments({ ...baseFilter, user: userId }),
//     ]);

//     // 🔹 3) Approvals (reliever/teamlead/hr/md)
//     const roleConditions: any[] = [];

//     // (a) Reliever stage
//     roleConditions.push({
//       relievers: {
//         $elemMatch: {
//           user: userId,
//           status: { $in: ['Pending', 'pending'] },
//         },
//       },
//       status: { $nin: ['Rejected', 'rejected'] },
//     });

//     // (b) Teamlead stage (AFTER both relievers approve)
//     roleConditions.push({
//       teamlead: userId,
//       status: { $in: ['Pending', 'pending'] },

//       // Both relievers must have acted
//       relievers: {
//         $not: {
//           $elemMatch: { status: { $in: ['Pending', 'pending'] } },
//         },
//       },

//       // Teamlead must not have acted yet
//       $nor: [{ reviewTrail: { $elemMatch: { role: 'teamlead' } } }],
//     });

//     // (c) HR stage
//     if (userRole === 'hr') {
//       roleConditions.push({
//         status: { $in: ['Pending', 'pending'] },

//         // HR must not have acted already
//         $nor: [{ reviewTrail: { $elemMatch: { role: 'hr' } } }],

//         $or: [
//           // Employee leave → teamlead approved
//           {
//             reviewTrail: {
//               $elemMatch: {
//                 role: 'teamlead',
//                 action: { $in: ['Approved', 'approved'] },
//               },
//             },
//           },

//           // Teamlead leave → both relievers approved
//           {
//             relievers: {
//               $not: {
//                 $elemMatch: { status: { $in: ['Pending', 'pending'] } },
//               },
//             },
//             reviewTrail: {
//               $not: {
//                 $elemMatch: { role: 'teamlead' },
//               },
//             },
//           },
//         ],
//       });
//     }

//     // (d) MD stage
//     if (userRole === 'md') {
//       roleConditions.push({
//         status: { $nin: ['Rejected', 'rejected'] },

//         // MD must not have acted already
//         $nor: [{ reviewTrail: { $elemMatch: { role: 'md' } } }],

//         $or: [
//           // MD’s own leave
//           { user: userId },

//           // Any leave already approved by HR
//           {
//             reviewTrail: {
//               $elemMatch: {
//                 role: 'hr',
//                 action: { $in: ['Approved', 'approved'] },
//               },
//             },
//           },
//         ],
//       });
//     }

//     // 🔹 4) Fetch approvals
//     const [approvalsRaw, approvalsTotal] = await Promise.all([
//       LeaveRequest.find({
//         ...baseFilter,
//         $or: roleConditions,
//       })
//         .sort({ createdAt: -1 })
//         .skip(skip)
//         .limit(pageSize)
//         .select(
//           '_id type startDate endDate days status reason createdAt user teamlead reviewTrail reviewLevels relievers allowance url',
//         )
//         .populate('user', 'staffId firstName lastName department')
//         .lean(),
//       LeaveRequest.countDocuments({ ...baseFilter, $or: roleConditions }),
//     ]);

//     // 🔹 5) HR/Admin extra → fetch all APPROVED requests
//     let allApprovedRaw: any[] = [];
//     let allApprovedTotal = 0;

//     if (['hr', 'admin'].includes(userRole!)) {
//       const approvedFilter = {
//         ...baseFilter,
//         status: { $in: ['Approved', 'approved'] },
//       };

//       [allApprovedRaw, allApprovedTotal] = await Promise.all([
//         LeaveRequest.find(approvedFilter)
//           .sort({ createdAt: -1 })
//           .skip(skip)
//           .limit(pageSize)
//           .select(
//             '_id type startDate endDate days status reason createdAt user teamlead reviewTrail reviewLevels relievers allowance url',
//           )
//           .populate('user', 'staffId firstName lastName department')
//           .lean(),
//         LeaveRequest.countDocuments(approvedFilter),
//       ]);
//     }

//     // 🔹 6) Mapping helper
//     const mapLeave = (leave: any) => {
//       const completedReviews = leave.reviewTrail?.length || 0;
//       const currentReviewerRole = leave.reviewLevels?.[completedReviews] ?? null;

//       return {
//         id: leave._id.toString(),
//         employeeId: leave.user?._id?.toString() ?? '',
//         employeeName: `${leave.user?.firstName ?? ''} ${leave.user?.lastName ?? ''}`.trim(),
//         department: leave.user?.department,
//         type: leave.type,
//         staffId: leave.user?.staffId,
//         startDate: leave.startDate,
//         endDate: leave.endDate,
//         days: leave.days,
//         reason: leave.reason,
//         status: String(leave.status).toLowerCase(),
//         appliedDate: leave.createdAt,
//         teamleadId: leave.teamlead?.toString?.() ?? '',
//         currentReviewerRole,
//         relievers: (leave.relievers ?? []).map((r: any) => ({
//           user: r.user?.toString?.() ?? '',
//           firstName: r.firstName,
//           lastName: r.lastName,
//           status: String(r.status ?? 'pending').toLowerCase(),
//           note: r.note,
//           actedAt: r.actedAt,
//         })),
//         reviewTrail: (leave.reviewTrail ?? []).map((r: any) => ({
//           reviewer: r.reviewer?.toString?.() ?? '',
//           role: r.role,
//           action: String(r.action).toLowerCase(),
//           date: r.date ? new Date(r.date).toISOString() : '',
//           note: r.note,
//         })),
//         allowance: !!leave.allowance,
//         url: leave.url,
//       };
//     };

//     // 🔹 7) Summary
//     const allUserLeaves = await LeaveRequest.find({ user: userId }).select('status').lean();
//     const summary = {
//       pending: allUserLeaves.filter((l) => ['pending', 'Pending'].includes(l.status)).length,
//       approved: allUserLeaves.filter((l) => ['approved', 'Approved'].includes(l.status)).length,
//       rejected: allUserLeaves.filter((l) => ['rejected', 'Rejected'].includes(l.status)).length,
//       expired: allUserLeaves.filter((l) => ['expired', 'Expired'].includes(l.status)).length,
//     };

//     // 🔹 8) Leave balances
//     const year = new Date().getFullYear();
//     const leaveBalance = await LeaveBalance.findOne({ user: userId, year }).lean();
//     const balance = leaveBalance
//       ? Object.entries(leaveBalance.balances).map(([type, remaining]) => ({
//           type,
//           remaining,
//         }))
//       : Object.entries(LeaveEntitlements).map(([type, entitlement]) => ({
//           type,
//           remaining: entitlement,
//         }));

//     const payload = {
//       data: {
//         myRequests: myRequestsRaw.map(mapLeave),
//         approvals: approvalsRaw.map(mapLeave),
//         allApproved: allApprovedRaw.map(mapLeave),
//         pagination: {
//           myRequests: {
//             total: myTotal,
//             page: pageNum,
//             limit: pageSize,
//             pages: Math.ceil(myTotal / pageSize),
//           },
//           approvals: {
//             total: approvalsTotal,
//             page: pageNum,
//             limit: pageSize,
//             pages: Math.ceil(approvalsTotal / pageSize),
//           },
//           allApproved: {
//             total: allApprovedTotal,
//             page: pageNum,
//             limit: pageSize,
//             pages: Math.ceil(allApprovedTotal / pageSize),
//           },
//         },
//         summary,
//         balance,
//       },
//     };

//     emitToUser(userId, 'leave:update', payload.data);

//     res.status(200).json({
//       success: true,
//       data: payload.data,
//     });
//   },
// );

export const getLeaveActivityFeed = asyncHandler(
  async (req: TypedRequest<{}, TypedRequestQuery, {}>, res: any, _next: NextFunction) => {
    const userId = req.user?._id as Types.ObjectId;
    const userRole = req.user?.role;
    const { status, from, to, page = '1', limit = '20' } = req.query;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    const pageNum = parseInt(page, 10);
    const pageSize = parseInt(limit, 10);
    const skip = (pageNum - 1) * pageSize;

    // 1) Base filter
    const baseFilter: any = {};
    if (status) {
      baseFilter.status = {
        $in: [status, String(status).charAt(0).toUpperCase() + String(status).slice(1)],
      };
    }
    if (from || to) {
      baseFilter.createdAt = {};
      if (from) baseFilter.createdAt.$gte = new Date(from);
      if (to) baseFilter.createdAt.$lte = new Date(to);
    }

    // 2) My own requests
    const [myRequestsRaw, myTotal] = await Promise.all([
      LeaveRequest.find({
        ...baseFilter,
        user: userId,
      })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pageSize)
        .select(
          '_id type startDate endDate days status reason createdAt user teamlead reviewLevels reviewTrail relievers allowance url',
        )
        .populate('user', 'staffId firstName lastName department')
        .lean(),
      LeaveRequest.countDocuments({ ...baseFilter, user: userId }),
    ]);

    // 3) Approvals
    const roleConditions: any[] = [];

    // (a) Reliever stage
    roleConditions.push({
      relievers: {
        $elemMatch: {
          user: userId,
          status: { $in: ['Pending', 'pending'] },
        },
      },
      status: { $nin: ['Rejected', 'rejected'] },
    });

    // (b) Teamlead stage (employee leave only)
    roleConditions.push({
      teamlead: userId,
      status: { $in: ['Pending', 'pending'] },

      // All relievers must be done
      relievers: {
        $not: {
          $elemMatch: { status: { $in: ['Pending', 'pending'] } },
        },
      },

      // Teamlead must not have acted yet
      $nor: [{ reviewTrail: { $elemMatch: { role: 'teamlead' } } }],
    });

    // (c) HR stage
    if (userRole === 'hr') {
      roleConditions.push({
        status: { $in: ['Pending', 'pending'] },

        // HR must not have acted already
        $nor: [{ reviewTrail: { $elemMatch: { role: 'hr' } } }],

        $or: [
          // Employee leave → teamlead approved
          {
            reviewTrail: {
              $elemMatch: {
                role: 'teamlead',
                action: { $in: ['Approved', 'approved'] },
              },
            },
          },

          // Teamlead leave → both relievers approved
          {
            relievers: {
              $not: {
                $elemMatch: { status: { $in: ['Pending', 'pending'] } },
              },
            },
            reviewTrail: {
              $not: {
                $elemMatch: { role: 'teamlead' },
              },
            },
          },
        ],
      });
    }

    // (d) MD stage
    if (userRole === 'md') {
      roleConditions.push({
        status: { $nin: ['Rejected', 'rejected'] },

        // MD must not have acted already
        $nor: [{ reviewTrail: { $elemMatch: { role: 'md' } } }],

        $or: [
          // MD’s own leave
          { user: userId },

          // Any leave already approved by HR
          {
            reviewTrail: {
              $elemMatch: {
                role: 'hr',
                action: { $in: ['Approved', 'approved'] },
              },
            },
          },
        ],
      });
    }

    // 4) Fetch approvals
    const [approvalsRaw, approvalsTotal] = await Promise.all([
      LeaveRequest.find({
        ...baseFilter,
        $or: roleConditions,
      })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pageSize)
        .select(
          '_id type startDate endDate days status reason createdAt user teamlead reviewTrail reviewLevels relievers allowance url',
        )
        .populate('user', 'staffId firstName lastName department')
        .lean(),
      LeaveRequest.countDocuments({ ...baseFilter, $or: roleConditions }),
    ]);

    // 5) HR/Admin extra → fetch all APPROVED requests
    let allApprovedRaw: any[] = [];
    let allApprovedTotal = 0;

    if (['hr', 'admin'].includes(userRole!)) {
      const approvedFilter = {
        ...baseFilter,
        status: { $in: ['Approved', 'approved'] },
      };

      [allApprovedRaw, allApprovedTotal] = await Promise.all([
        LeaveRequest.find(approvedFilter)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(pageSize)
          .select(
            '_id type startDate endDate days status reason createdAt user teamlead reviewTrail reviewLevels relievers allowance url',
          )
          .populate('user', 'staffId firstName lastName department')
          .lean(),
        LeaveRequest.countDocuments(approvedFilter),
      ]);
    }

    // 6) Mapping helper
    const mapLeave = (leave: any) => {
      const completedReviews = leave.reviewTrail?.length || 0;
      const currentReviewerRole = leave.reviewLevels?.[completedReviews] ?? null;

      return {
        id: leave._id.toString(),
        employeeId: leave.user?._id?.toString() ?? '',
        employeeName: `${leave.user?.firstName ?? ''} ${leave.user?.lastName ?? ''}`.trim(),
        department: leave.user?.department,
        type: leave.type,
        staffId: leave.user?.staffId,
        startDate: leave.startDate,
        endDate: leave.endDate,
        days: leave.days,
        reason: leave.reason,
        status: String(leave.status).toLowerCase(),
        appliedDate: leave.createdAt,
        teamleadId: leave.teamlead?.toString?.() ?? '',
        currentReviewerRole,
        relievers: (leave.relievers ?? []).map((r: any) => ({
          user: r.user?.toString?.() ?? '',
          firstName: r.firstName,
          lastName: r.lastName,
          status: String(r.status ?? 'pending').toLowerCase(),
          note: r.note,
          actedAt: r.actedAt,
        })),
        reviewTrail: (leave.reviewTrail ?? []).map((r: any) => ({
          reviewer: r.reviewer?.toString?.() ?? '',
          role: r.role,
          action: String(r.action).toLowerCase(),
          date: r.date ? new Date(r.date).toISOString() : '',
          note: r.note,
        })),
        allowance: !!leave.allowance,
        url: leave.url,
      };
    };

    // 7) Summary
    const allUserLeaves = await LeaveRequest.find({ user: userId }).select('status').lean();
    const summary = {
      pending: allUserLeaves.filter((l) => ['pending', 'Pending'].includes(l.status)).length,
      approved: allUserLeaves.filter((l) => ['approved', 'Approved'].includes(l.status)).length,
      rejected: allUserLeaves.filter((l) => ['rejected', 'Rejected'].includes(l.status)).length,
      expired: allUserLeaves.filter((l) => ['expired', 'Expired'].includes(l.status)).length,
    };

    // 8) Leave balances
    const year = new Date().getFullYear();
    const leaveBalance = await LeaveBalance.findOne({ user: userId, year }).lean();
    const balance = leaveBalance
      ? Object.entries(leaveBalance.balances).map(([type, remaining]) => ({
          type,
          remaining,
        }))
      : Object.entries(LeaveEntitlements).map(([type, entitlement]) => ({
          type,
          remaining: entitlement,
        }));

    const payload = {
      data: {
        myRequests: myRequestsRaw.map(mapLeave),
        approvals: approvalsRaw.map(mapLeave),
        allApproved: allApprovedRaw.map(mapLeave),
        pagination: {
          myRequests: {
            total: myTotal,
            page: pageNum,
            limit: pageSize,
            pages: Math.ceil(myTotal / pageSize),
          },
          approvals: {
            total: approvalsTotal,
            page: pageNum,
            limit: pageSize,
            pages: Math.ceil(approvalsTotal / pageSize),
          },
          allApproved: {
            total: allApprovedTotal,
            page: pageNum,
            limit: pageSize,
            pages: Math.ceil(allApprovedTotal / pageSize),
          },
        },
        summary,
        balance,
      },
    };

    emitToUser(userId, 'leave:update', payload.data);

    res.status(200).json({
      success: true,
      data: payload.data,
    });
  },
);


// export const getLeaveActivityFeed = asyncHandler(
//   async (req: TypedRequest<{}, TypedRequestQuery, {}>, res: any, _next: NextFunction) => {
//     const userId = req.user?._id as Types.ObjectId;
//     const userRole = req.user?.role;
//     const { status, from, to, page = '1', limit = '20' } = req.query;

//     if (!userId) {
//       return res.status(401).json({ success: false, message: 'User not authenticated' });
//     }

//     const pageNum = parseInt(page, 10);
//     const pageSize = parseInt(limit, 10);
//     const skip = (pageNum - 1) * pageSize;

//     // 🔹 1) Base filter
//     const baseFilter: any = {};
//     if (status) {
//       baseFilter.status = {
//         $in: [status, String(status).charAt(0).toUpperCase() + String(status).slice(1)],
//       };
//     }
//     if (from || to) {
//       baseFilter.createdAt = {};
//       if (from) baseFilter.createdAt.$gte = new Date(from);
//       if (to) baseFilter.createdAt.$lte = new Date(to);
//     }

//     // 🔹 2) My own requests (with pagination)
//     const [myRequestsRaw, myTotal] = await Promise.all([
//       LeaveRequest.find({
//         ...baseFilter,
//         user: userId,
//       })
//         .sort({ createdAt: -1 })
//         .skip(skip)
//         .limit(pageSize)
//         .select(
//           '_id type startDate endDate days status reason createdAt user teamlead reviewLevels reviewTrail relievers allowance url',
//         )
//         .populate('user', 'staffId firstName lastName department')
//         .lean(),
//       LeaveRequest.countDocuments({ ...baseFilter, user: userId }),
//     ]);

//     // 🔹 3) Approvals (reliever/teamlead/hr)
//     const roleConditions: any[] = [];

//     // (a) Reliever stage
//     roleConditions.push({
//       relievers: {
//         $elemMatch: {
//           user: userId,
//           status: { $in: ['Pending', 'pending'] },
//         },
//       },
//       status: { $nin: ['Rejected', 'rejected'] },
//     });

//     // (b) Teamlead stage
//     roleConditions.push({
//       teamlead: userId,
//       status: { $in: ['Pending', 'pending'] },
//       relievers: {
//         $not: {
//           $elemMatch: {
//             status: { $in: ['Pending', 'pending', 'Rejected', 'rejected'] },
//           },
//         },
//       },
//       $nor: [{ reviewTrail: { $elemMatch: { role: 'teamlead' } } }],
//     });

//     // (c) HR stage
//     if (userRole === 'hr') {
//       roleConditions.push({
//         status: { $in: ['Pending', 'pending'] },
//         relievers: {
//           $not: {
//             $elemMatch: {
//               status: { $in: ['Pending', 'pending', 'Rejected', 'rejected'] },
//             },
//           },
//         },
//         reviewTrail: {
//           $elemMatch: {
//             role: 'teamlead',
//             action: { $in: ['Approved', 'approved'] },
//           },
//         },
//         $nor: [{ reviewTrail: { $elemMatch: { role: 'hr' } } }],
//       });
//     }

//     // (d) MD stage — teamlead leave only
//     if (userRole === 'md') {
//       roleConditions.push({
//         status: { $in: ['Pending', 'pending'] },

//         // HR must have approved
//         reviewTrail: {
//           $elemMatch: {
//             role: 'hr',
//             action: { $in: ['Approved', 'approved'] },
//           },
//         },

//         // Teamlead leave → no teamlead review exists
//         $nor: [
//           { reviewTrail: { $elemMatch: { role: 'teamlead' } } },
//           { reviewTrail: { $elemMatch: { role: 'md' } } }, 
//         ],
//       });
//     }


//     const [approvalsRaw, approvalsTotal] = await Promise.all([
//       LeaveRequest.find({
//         ...baseFilter,
//         $or: roleConditions,
//       })
//         .sort({ createdAt: -1 })
//         .skip(skip)
//         .limit(pageSize)
//         .select(
//           '_id type startDate endDate days status reason createdAt user teamlead reviewTrail reviewLevels relievers allowance url',
//         )
//         .populate('user', 'staffId firstName lastName department')
//         .lean(),
//       LeaveRequest.countDocuments({ ...baseFilter, $or: roleConditions }),
//     ]);

//     // 🔹 4) HR/Admin extra → fetch all APPROVED requests
//     let allApprovedRaw: any[] = [];
//     let allApprovedTotal = 0;

//     if (['hr', 'admin'].includes(userRole!)) {
//       const approvedFilter = {
//         ...baseFilter,
//         status: { $in: ['Approved', 'approved'] },
//       };

//       [allApprovedRaw, allApprovedTotal] = await Promise.all([
//         LeaveRequest.find(approvedFilter)
//           .sort({ createdAt: -1 })
//           .skip(skip)
//           .limit(pageSize)
//           .select(
//             '_id type startDate endDate days status reason createdAt user teamlead reviewTrail reviewLevels relievers allowance url',
//           )
//           .populate('user', 'staffId firstName lastName department')
//           .lean(),
//         LeaveRequest.countDocuments(approvedFilter),
//       ]);
//     }

//     // 🔹 5) Mapping helper
//     const mapLeave = (leave: any) => {
//       let currentReviewerRole: 'reliever' | 'teamlead' | 'hr' | 'md' | null = null;
//         const completedReviews = leave.reviewTrail?.length || 0;
//         currentReviewerRole = leave.reviewLevels?.[completedReviews] ?? null;

//       return {
//         id: leave._id.toString(),
//         employeeId: leave.user?._id?.toString() ?? '',
//         employeeName: `${leave.user?.firstName ?? ''} ${leave.user?.lastName ?? ''}`.trim(),
//         department: leave.user?.department,
//         type: leave.type,
//         staffId: leave.user?.staffId,
//         startDate: leave.startDate,
//         endDate: leave.endDate,
//         days: leave.days,
//         reason: leave.reason,
//         status: String(leave.status).toLowerCase(),
//         appliedDate: leave.createdAt,
//         teamleadId: leave.teamlead?.toString?.() ?? '',
//         teamleadName: '',
//         currentReviewerRole,
//         relievers: (leave.relievers ?? []).map((r: any) => ({
//           user: r.user?.toString?.() ?? '',
//           firstName: r.firstName,
//           lastName: r.lastName,
//           status: String(r.status ?? 'pending').toLowerCase(),
//           note: r.note ?? undefined,
//           actedAt: r.actedAt ?? undefined,
//         })),
//         reviewTrail: (leave.reviewTrail ?? []).map((r: any) => ({
//           reviewer: r.reviewer?.toString?.() ?? '',
//           role: r.role,
//           action: String(r.action).toLowerCase(),
//           date: r.date ? new Date(r.date).toISOString() : '',
//           note: r.note,
//         })),
//         allowance: !!leave.allowance,
//         url: leave.url ?? undefined,
//       };
//     };

//     // 🔹 6) Summary (only for my requests)
//     const allUserLeaves = await LeaveRequest.find({ user: userId }).select('status').lean();
//     const summary = {
//       pending: allUserLeaves.filter((l) => ['pending', 'Pending'].includes(l.status)).length,
//       approved: allUserLeaves.filter((l) => ['approved', 'Approved'].includes(l.status)).length,
//       rejected: allUserLeaves.filter((l) => ['rejected', 'Rejected'].includes(l.status)).length,
//       expired: allUserLeaves.filter((l) => ['expired', 'Expired'].includes(l.status)).length,
//     };

//     // 🔹 7) Leave balances
//     const year = new Date().getFullYear();
//     const leaveBalance = await LeaveBalance.findOne({ user: userId, year }).lean();
//     const balance = leaveBalance
//       ? Object.entries(leaveBalance.balances).map(([type, remaining]) => ({
//           type,
//           remaining,
//         }))
//       : Object.entries(LeaveEntitlements).map(([type, entitlement]) => ({
//           type,
//           remaining: entitlement,
//         }));

//     const payload: any = {
//       data: {
//         myRequests: myRequestsRaw.map(mapLeave),
//         approvals: approvalsRaw.map(mapLeave),
//         allApproved: allApprovedRaw.map(mapLeave),
//         pagination: {
//           myRequests: {
//             total: myTotal,
//             page: pageNum,
//             limit: pageSize,
//             pages: Math.ceil(myTotal / pageSize),
//           },
//           approvals: {
//             total: approvalsTotal,
//             page: pageNum,
//             limit: pageSize,
//             pages: Math.ceil(approvalsTotal / pageSize),
//           },
//           allApproved: {
//             total: allApprovedTotal,
//             page: pageNum,
//             limit: pageSize,
//             pages: Math.ceil(allApprovedTotal / pageSize),
//           },
//         },
//         summary,
//         balance,
//       },
//     };

//     emitToUser(userId, 'leave:update', payload.data);

//     res.status(200).json({
//       success: true,
//       data: payload.data,
//     });
//   },
// );

// export const getLeaveApprovers = asyncHandler(
//   async (req: TypedRequest, res: any, _next: NextFunction) => {
//     const currentUser = await User.findById(req.user?.id);
//     if (!currentUser) {
//       return res.status(404).json({ success: false, message: 'User not found' });
//     }

//     let approverRoles: string[] = [];
//     let cacheKey = '';

//     switch (currentUser.role) {
//       case 'employee':
//         // Employee → reliever → teamlead → hr
//         approverRoles = ['reliever', 'teamlead', 'hr'];
//         cacheKey = `approvers:employee:${currentUser.company}:${currentUser.department}`;
//         break;

//       case 'teamlead':
//         // Teamlead → reliever → hr
//         approverRoles = ['reliever', 'hr'];
//         cacheKey = `approvers:teamlead:${currentUser.company}`;
//         break;

//       case 'hr':
//         approverRoles = [];
//         cacheKey = `approvers:hr:${currentUser.company}`;
//         break;

//       case 'md':
//         approverRoles = [];
//         cacheKey = `approvers:md:${currentUser.company}`;
//         break;

//       default:
//         return res.status(400).json({ success: false, message: 'Invalid role' });
//     }

//     const cached = await redisClient.get(cacheKey);
//     if (cached) {
//       return res.status(200).json({
//         success: true,
//         data: JSON.parse(cached),
//         cached: true,
//       });
//     }

//     if (approverRoles.length === 0) {
//       return res.status(200).json({
//         success: true,
//         data: [],
//         cached: false,
//       });
//     }

//     const query: any = {
//       role: { $in: approverRoles },
//       company: currentUser.company,
//       isActive: true,
//     };

//     if (currentUser.role === 'employee') {
//       query.$or = [
//         { role: 'reliever', department: currentUser.department },
//         { role: 'teamlead', department: currentUser.department },
//         { role: 'hr', department: currentUser.department },
//         { role: 'md', department: currentUser.department },
//       ];
//     }

//     const approvers = await User.find(query).select('_id firstName lastName department role');

//     const relievers = approvers.filter((u) => u.role === 'reliever');
//     const teamlead = approvers.find((u) => u.role === 'teamlead');
//     const hr = approvers.find((u) => u.role === 'hr');
//     const md = approvers.find((u) => u.role === 'md');

//     const orderedApprovers = [
//       ...relievers.map((u) => ({
//         id: u._id,
//         name: `${u.firstName} ${u.lastName}`,
//         department: u.department,
//         role: u.role,
//       })),
//       ...(teamlead
//         ? [
//             {
//               id: teamlead._id,
//               name: `${teamlead.firstName} ${teamlead.lastName}`,
//               department: teamlead.department,
//               role: teamlead.role,
//             },
//           ]
//         : []),
//       ...(hr
//         ? [
//             {
//               id: hr._id,
//               name: `${hr.firstName} ${hr.lastName}`,
//               department: hr.department,
//               role: hr.role,
//             },
//           ]
//         : []),
//       ...(md
//         ? [
//             {
//               id: md._id,
//               name: `${md.firstName} ${md.lastName}`,
//               department: md.department,
//               role: md.role,
//             },
//           ]
//         : []),
//     ];

//     await redisClient.setex(cacheKey, 86400, JSON.stringify(orderedApprovers));

//     res.status(200).json({
//       success: true,
//       data: orderedApprovers,
//       cached: false,
//     });
//   },
// );

export const getLeaveApprovers = asyncHandler(
  async (req: TypedRequest, res: any, _next: NextFunction) => {
    const currentUser = await User.findById(req.user?.id);
    if (!currentUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    let approverRoles: string[] = [];
    let cacheKey = '';

    switch (currentUser.role) {
      case 'employee':
        // Employee → reliever → teamlead → hr
        approverRoles = ['reliever', 'teamlead', 'hr'];
        cacheKey = `approvers:employee:${currentUser.company}:${currentUser.department}`;
        break;

      case 'teamlead':
        // Teamlead → reliever → hr
        approverRoles = ['reliever', 'hr'];
        cacheKey = `approvers:teamlead:${currentUser.company}`;
        break;

      case 'hr':
        approverRoles = [];
        cacheKey = `approvers:hr:${currentUser.company}`;
        break;

      case 'md':
        approverRoles = [];
        cacheKey = `approvers:md:${currentUser.company}`;
        break;

      default:
        return res.status(400).json({ success: false, message: 'Invalid role' });
    }

    const cached = await redisClient.get(cacheKey);
    if (cached) {
      return res.status(200).json({
        success: true,
        data: JSON.parse(cached),
        cached: true,
      });
    }

    if (approverRoles.length === 0) {
      return res.status(200).json({
        success: true,
        data: [],
        cached: false,
      });
    }

    const query: any = {
      role: { $in: approverRoles },
      company: currentUser.company,
      isActive: true,
    };

    // ⭐ FIXED: Employee approvers logic
    if (currentUser.role === 'employee') {
      query.$or = [
        { role: 'reliever', department: currentUser.department },
        { role: 'teamlead', department: currentUser.department },
        { role: 'hr' }, // HR is company-wide
      ];
    }

    // ⭐ Teamlead logic stays the same (relievers + HR)
    // No department restriction for HR

    const approvers = await User.find(query).select('_id firstName lastName department role');

    const relievers = approvers.filter((u) => u.role === 'reliever');
    const teamlead = approvers.find((u) => u.role === 'teamlead');
    const hr = approvers.find((u) => u.role === 'hr');
    const md = approvers.find((u) => u.role === 'md');

    const orderedApprovers = [
      ...relievers.map((u) => ({
        id: u._id,
        name: `${u.firstName} ${u.lastName}`,
        department: u.department,
        role: u.role,
      })),
      ...(teamlead
        ? [
            {
              id: teamlead._id,
              name: `${teamlead.firstName} ${teamlead.lastName}`,
              department: teamlead.department,
              role: teamlead.role,
            },
          ]
        : []),
      ...(hr
        ? [
            {
              id: hr._id,
              name: `${hr.firstName} ${hr.lastName}`,
              department: hr.department,
              role: hr.role,
            },
          ]
        : []),
      ...(md
        ? [
            {
              id: md._id,
              name: `${md.firstName} ${md.lastName}`,
              department: md.department,
              role: md.role,
            },
          ]
        : []),
    ];

    await redisClient.setex(cacheKey, 86400, JSON.stringify(orderedApprovers));

    res.status(200).json({
      success: true,
      data: orderedApprovers,
      cached: false,
    });
  },
);


// export const getLeaveApprovers = asyncHandler(
//   async (req: TypedRequest, res: any, _next: NextFunction) => {
//     const currentUser = await User.findById(req.user?.id);
//     if (!currentUser) {
//       return res.status(404).json({ success: false, message: 'User not found' });
//     }
//     let approverRoles: string[] = [];
//     let cacheKey = '';
//     switch (currentUser.role) {
//       case 'employee':
//         approverRoles = ['reliever', 'teamlead', 'hr'];
//         cacheKey = `approvers:employee:${currentUser.company}:${currentUser.department}`;
//         break;
//       case 'teamlead':
//         approverRoles = ['hr'];
//         cacheKey = `approvers:teamlead:${currentUser.company}`;
//         break;
//       case 'hr':
//         approverRoles = [];
//         cacheKey = `approvers:hr:${currentUser.company}`;
//         break;
//       case 'md':
//         approverRoles = [];
//         cacheKey = `approvers:md:${currentUser.company}`;
//         break;
//       default:
//         return res.status(400).json({ success: false, message: 'Invalid role' });
//     }

//     const cached = await redisClient.get(cacheKey);
//     if (cached) {
//       return res.status(200).json({
//         success: true,
//         data: JSON.parse(cached),
//         cached: true,
//       });
//     }
//     if (approverRoles.length === 0) {
//       return res.status(200).json({
//         success: true,
//         data: [],
//         cached: false,
//       });
//     }

//     const query: any = {
//       role: { $in: approverRoles },
//       company: currentUser.company,
//       isActive: true,
//     };
//     if (currentUser.role === 'employee') {
//       query.$or = [
//         { role: 'reliever', department: currentUser.department },
//         { role: 'teamlead', department: currentUser.department },
//         { role: 'hr', department: currentUser.department },
//         { role: 'md', department: currentUser.department },
//       ];
//     }
//     const approvers = await User.find(query).select('_id firstName lastName department role');
//     const relievers = approvers.filter((u) => u);
//     const teamlead = approvers.find((u) => u.role === 'teamlead');
//     const hr = approvers.find((u) => u.role === 'hr');
//     const md = approvers.find((u) => u.role === 'md');
//     const orderedApprovers = [
//       ...relievers.map((u) => ({
//         id: u._id,
//         name: `${u.firstName} ${u.lastName}`,
//         department: u.department,
//         role: u.role,
//       })),
//       ...(teamlead
//         ? [
//             {
//               id: teamlead._id,
//               name: `${teamlead.firstName} ${teamlead.lastName}`,
//               department: teamlead.department,
//               role: teamlead.role,
//             },
//           ]
//         : []),
//       ...(hr
//         ? [
//             {
//               id: hr._id,
//               name: `${hr.firstName} ${hr.lastName}`,
//               department: hr.department,
//               role: hr.role,
//             },
//           ]
//         : []),
//       ...(md
//         ? [
//             {
//               id: md._id,
//               name: `${md.firstName} ${md.lastName}`,
//               department: md.department,
//               role: md.role,
//             },
//           ]
//         : []),
//     ];
//     await redisClient.setex(cacheKey, 86400, JSON.stringify(orderedApprovers));
//     res.status(200).json({
//       success: true,
//       data: orderedApprovers,
//       cached: false,
//     });
//   },
// );

// export const getLeaveStatusOverview = asyncHandler(
//   async (
//     req: TypedRequest<{}, {}, {}>,
//     res: TypedResponse<{ pending: number; approved: number; rejected: number; total: number }>,
//     next: NextFunction,
//   ) => {
//     try {
//       const userId = req.user?._id;
//       if (!userId) {
//         res.status(401).json({
//           success: false,
//           message: 'Unauthorized',
//         });
//         return;
//       }

//       const [pending, approved, rejected] = await Promise.all([
//         LeaveRequest.countDocuments({ user: userId, status: 'Pending' }),
//         LeaveRequest.countDocuments({ user: userId, status: 'Approved' }),
//         LeaveRequest.countDocuments({ user: userId, status: 'Rejected' }),
//       ]);

//       const total = pending + approved + rejected;

//       res.status(200).json({
//         success: true,
//         data: { pending, approved, rejected, total },
//       });
//     } catch (err) {
//       next(err);
//     }
//   },
// );


export const deleteLeave = asyncHandler(
  async (req: TypedRequest<{ id?: string }, {}, {}>, res: any, next: NextFunction)  => {
    const leaveId = req.params.id;
    const userId = req.user?._id;
    const companyId = req.company?._id;



    // 1. Find leave
    const leave = await LeaveRequest.findById(leaveId);
    if (!leave) {
      return next(new ErrorResponse("Leave request not found", 404));
    }

    if (!leave) return next(new ErrorResponse("Leave request not found", 404));


    // 2. Prevent deleting processed leave
    if (leave.status !== "Pending") {
      return next(
        new ErrorResponse(
          "You cannot delete this leave request because it has already been processed",
          400
        )
      );
    }



    // 3. Restore Leave Balance
    const balance = await LeaveBalance.findOne({
      user: leave.user,
      company: companyId,
      year: new Date().getFullYear(),
    });

    if (!balance) {
      return next(new ErrorResponse("Leave balance not found", 400));
    }

    
    // TS fix — days is required but TypeScript doesn't know
    const restoredDays = leave.days!;
    
    
    
    balance.balances[leave.type] += restoredDays;
    await balance.save();

    // 4. Delete leave
    await leave.deleteOne();

    // 5. Audit
    await logAudit({
      userId,
      action: "DELETE_LEAVE_REQUEST",
      status: "SUCCESS",
      ip: req.ip,
      userAgent: req.get("user-agent"),
      details: {
        leaveId,
        restoredDays,
        leaveType: leave.type,
      },
    });

    res.status(200).json({
      success: true,
      message: "Leave request deleted and leave balance restored",
    });
  }
);
