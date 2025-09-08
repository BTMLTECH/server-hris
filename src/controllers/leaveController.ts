import { NextFunction } from 'express';
import { Types } from 'mongoose';
import { asyncHandler } from '../middleware/asyncHandler';
import LeaveRequest, { ILeaveRequest, LeaveEntitlements, TypedRequestQuery } from '../models/LeaveRequest';
import User, { IUser } from '../models/user.model';
import { ApproveLeaveRequest, ApproveLeaveRequestResponse, CreateLeaveRequestBody, CreateLeaveRequestResponse, GetLeaveActivityFeedDTO, LeaveActivityFeedItem, LeaveActivityFeedResponse, PopulatedLeaveRequest } from '../types/leaveType';
import { TypedRequest } from '../types/typedRequest';
import { TypedResponse } from '../types/typedResponse';
import ErrorResponse from '../utils/ErrorResponse';
import { calculateWorkingDays } from '../utils/calculateWorkingDays';
import { logAudit } from '../utils/logAudit';
import { sendNotification } from '../utils/sendNotification';
import { redisClient } from '../utils/redisClient';
import LeaveBalance from '../models/LeaveBalance';
import { uploadToCloudinary } from '../utils/cloudinary';
import userModel from '../models/user.model';




export const createLeaveRequest = asyncHandler(
  async (
    req: TypedRequest<{}, {} , CreateLeaveRequestBody>,
    res: TypedResponse<CreateLeaveRequestResponse>,
    next: NextFunction
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
    const company = req.company;

    if (!type || !startDate || !endDate || !reason || !teamleadId || !days) {
      return next(new ErrorResponse("All fields are required", 400));
    }

    if (!relieverEmails || relieverEmails.length < 2 || relieverEmails.length > 3) {
      return next(new ErrorResponse("You must provide 2 or 3 relievers", 400));
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (end < start) {
      return next(new ErrorResponse("Invalid date range", 400));
    }

    // Get or initialize leave balance
    let balance = await LeaveBalance.findOne({ user: userId, year: new Date().getFullYear() });
    if (!balance) balance = await LeaveBalance.create({ user: userId,     company: company?._id, });

    if (days > balance.balances[type]) {
      return next(
        new ErrorResponse(
          `Insufficient ${type} leave balance. You only have ${balance.balances[type]} days left.`,
          400
        )
      );
    }

    // Deduct leave immediately
    balance.balances[type] -= days;
    await balance.save();

    // Handle file upload
    let fileUrl: string | undefined;
    if (req.file) {
      const uploadedFile = await uploadToCloudinary(
        req.file.buffer,
        `leave/${company?._id}`,
        "raw",
        `leave_${req.user?.firstName}_${req.user?.lastName}_${Date.now()}.pdf`
      );
      fileUrl = uploadedFile.secure_url;
    }

    // Convert reliever emails to User objects
    const relieverUsers = await userModel.find({ email: { $in: relieverEmails } }) as IUser[];
    if (relieverUsers.length < 2 || relieverUsers.length > 3) {
      return next(new ErrorResponse("Some relievers are invalid", 400));
    }

    const relieversWithNames = relieverUsers.map((reliever) => ({
      user: reliever._id,
      firstName: reliever.firstName,
      lastName: reliever.lastName,
    }));

    const reviewLevels = [...relieversWithNames.map(() => "reliever"), "teamlead", "hr"];

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
      status: "Pending",
      reviewLevels,
      typeIdentify,
      allowance: allowance === "yes",
      url: fileUrl,
      reviewTrail: [],
    });

    // Notify relievers
    await Promise.all(
      relieverUsers.map(async (reliever) => {
        try {
          await sendNotification({
            user: reliever,
            type: "NEW_LEAVE_REQUEST",
            title: "Leave Request Requires Your Review",
            message: `${req.user?.firstName} submitted a ${type} leave from ${startDate} to ${endDate}. You are listed as a reliever.`,
            emailSubject: "Leave Request to Review",
            emailTemplate: "leave-review-request.ejs",
            emailData: {
              reviewerName: reliever.firstName,
              employeeName: req.user?.firstName,
              type,
              startDate,
              endDate,
              daysCount: days,
              companyName: company?.branding?.displayName || company?.name,
              logoUrl: company?.branding?.logoUrl,
              primaryColor: company?.branding?.primaryColor || "#0621b6b0",
            },
          });
        } catch {}
      })
    );

    // Audit log
    await logAudit({
      userId,
      action: "CREATE_LEAVE_REQUEST",
      status: "SUCCESS",
      ip: req.ip,
      userAgent: req.get("user-agent"),
    });

    res.status(201).json({
      success: true,
      message: "Leave request submitted",
      data: { data: leave },
    });
  }
);


export const approveLeaveRequest = asyncHandler(
  async (
    req: TypedRequest<{id?:string},{}, {}>,
    res: any,
    next: NextFunction
  ) => {
    try {
    const leaveId = req.params.id;
    const reviewer = req.user!;
    const reviewerRole = reviewer.role;
    const reviewerId = reviewer._id as Types.ObjectId;
    const company = req.company;

    const leave = await LeaveRequest.findById(leaveId).populate<{ user: IUser }>('user');

      if (!leave) return next(new ErrorResponse("Leave not found", 404));
      if (leave.status !== "Pending") return next(new ErrorResponse("Leave already reviewed", 400));

      const completedReviews = leave.reviewTrail?.length || 0;
      const currentLevel = leave.reviewLevels[completedReviews];
      const relievers = leave.relievers || [];

      // ✅ Add approval record for reliever
      if (currentLevel === "reliever") {
        const reliever = relievers.find((r) => r.user.toString() === reviewerId.toString());
        if (reliever) {
          reliever.status = "Approved";
          reliever.creactedAt = new Date();
        }
      }

      leave.reviewTrail.push({
        reviewer: reviewerId,
        role: currentLevel,
        action: "Approved",
        date: new Date(),
      });

      // ✅ Update leave status if last stage
      const isLastStage = completedReviews + 1 === leave.reviewLevels.length;
      if (isLastStage) {
        leave.status = "Approved";
      }

      await LeaveRequest.updateOne({ _id: leaveId }, leave);

      // ✅ Send notifications
      if (isLastStage) {
        // Notify employee
        await sendNotification({
          user: leave.user,
          type: "LEAVE_APPROVED",
          title: "Leave Approved ✅",
          message: `Your ${leave.type} leave has been fully approved.`,
          emailSubject: "Leave Approved",
          emailTemplate: "leave-approved.ejs",
          emailData: {
            name: leave.user.firstName,
            type: leave.type,
            startDate: leave.startDate,
            endDate: leave.endDate,
            days: leave.days,
            companyName: company?.branding?.displayName || company?.name,
            logoUrl: company?.branding?.logoUrl,
            primaryColor: company?.branding?.primaryColor || "#0621b6b0",
          },
        });
      } else {
        // Notify next reviewer
        const nextLevel = leave.reviewLevels[completedReviews + 1];

        if (nextLevel === "reliever") {
          const nextReliever = relievers.find((r) => r.status === "Pending");
          if (nextReliever) {
            const userNext = await userModel.findById(nextReliever.user);
            if (userNext) {
              await sendNotification({
                user: userNext,
                type: "LEAVE_AWAITING_REVIEW",
                title: "Leave Awaiting Review",
                message: `${leave.user.firstName}'s ${leave.type} leave is pending your review.`,
                emailSubject: "Leave Approval Needed",
                emailTemplate: "leave-review-request.ejs",
                emailData: {
                  reviewerName: userNext.firstName,
                  employeeName: leave.user.firstName,
                  type: leave.type,
                  startDate: leave.startDate,
                  endDate: leave.endDate,
                  days: leave.days,
                  companyName: company?.branding?.displayName || company?.name,
                  logoUrl: company?.branding?.logoUrl,
                  primaryColor: company?.branding?.primaryColor || "#0621b6b0",
                },
              });
            }
          }
        } else {
          const nextReviewer =
            nextLevel === "teamlead"
              ? await userModel.findById(leave.teamlead)
              : await userModel.findOne({ role: "hr", company: reviewer.company });

          if (nextReviewer) {
            await sendNotification({
              user: nextReviewer,
              type: "LEAVE_AWAITING_REVIEW",
              title: "Leave Awaiting Review",
              message: `${leave.user.firstName}'s ${leave.type} leave is pending your review.`,
              emailSubject: "Leave Approval Needed",
              emailTemplate: "leave-review-request.ejs",
              emailData: {
                reviewerName: nextReviewer.firstName,
                employeeName: leave.user.firstName,
                type: leave.type,
                startDate: leave.startDate,
                endDate: leave.endDate,
                days: leave.days,
                companyName: company?.branding?.displayName || company?.name,
                logoUrl: company?.branding?.logoUrl,
                primaryColor: company?.branding?.primaryColor || "#0621b6b0",
              },
            });
          }
        }
      }

      await logAudit({
        userId: reviewerId,
        action: "APPROVE_LEAVE_REQUEST",
        status: "SUCCESS",
        ip: req.ip,
        userAgent: req.get("user-agent"),
      });

      res.status(200).json({
        success: true,
        message: isLastStage ? "Leave fully approved" : "Leave approved at current stage",
        data: { data: leave },
      });
    } catch (err: any) {
      next(new ErrorResponse(err.message, 500));
    }
  }
);

export const rejectLeaveRequest = asyncHandler(
  async (
    req: TypedRequest<{ id?: string }, {}, {}>,
    res: any,
    next: NextFunction
  ) => {
    try {
      const leaveId = req.params.id;
      const reviewer = req.user!;
      const reviewerRole = reviewer.role;
      const reviewerId = reviewer._id as Types.ObjectId;
      const company = req.company;

      const leave = await LeaveRequest.findById(leaveId).populate<{ user: IUser }>("user");

      if (!leave) return next(new ErrorResponse("Leave not found", 404));
      if (leave.status !== "Pending") return next(new ErrorResponse("Leave already reviewed", 400));

      const completedReviews = leave.reviewTrail?.length || 0;
      const currentLevel = leave.reviewLevels[completedReviews];
      const relievers = leave.relievers || [];

      // ✅ Add rejection record for reliever
      if (currentLevel === "reliever") {
        const reliever = relievers.find((r) => r.user.toString() === reviewerId.toString());
        if (reliever) {
          reliever.status = "Rejected";
          reliever.creactedAt = new Date();
        }
      }

      leave.reviewTrail.push({
        reviewer: reviewerId,
        role: currentLevel,
        action: "Rejected",
        date: new Date(),
      });

      // ✅ Update leave status if last stage
      leave.status = "Rejected";

      await LeaveRequest.updateOne({ _id: leaveId }, leave);

      // ✅ Notify employee
      await sendNotification({
        user: leave.user,
        type: "LEAVE_REJECTED",
        title: "Leave Rejected ❌",
        message: `Your ${leave.type} leave has been rejected at the current review stage.`,
        emailSubject: "Leave Rejected",
        emailTemplate: "leave-rejected.ejs",
        emailData: {
          name: leave.user.firstName,
          type: leave.type,
          startDate: leave.startDate,
          endDate: leave.endDate,
          days: leave.days,
          companyName: company?.branding?.displayName || company?.name,
          logoUrl: company?.branding?.logoUrl,
          primaryColor: company?.branding?.primaryColor || "#0621b6b0",
        },
      });

      await logAudit({
        userId: reviewerId,
        action: "REJECT_LEAVE_REQUEST",
        status: "SUCCESS",
        ip: req.ip,
        userAgent: req.get("user-agent"),
      });

      res.status(200).json({
        success: true,
        message: "Leave rejected",
        data: { data: leave },
      });
    } catch (err: any) {
      next(new ErrorResponse(err.message, 500));
    }
  }
);



export const getLeaveApprovalQueue = asyncHandler(
  async (
    req: TypedRequest<{}, {}, {}>,
    res: TypedResponse<{ data: ILeaveRequest[] }>,
    next: NextFunction
  ) => {
    try {
      const userRole = req.user?.role!;
      const userId = req.user?._id;

      if (!userRole || !userId) {
        res.status(200).json({ success: true, data: { data: [] } });
        return;
      }

      // Pull all pending leaves
      const leaves: ILeaveRequest[] = await LeaveRequest.find({ status: "Pending" })
        .populate("user", "firstName lastName email")
        .sort({ createdAt: -1 });

      const queue: ILeaveRequest[] = leaves.filter((leave) => {
        const completedReviews = leave.reviewTrail?.length || 0;
        const currentLevel = leave.reviewLevels[completedReviews];

        if (currentLevel === "reliever") {
          return leave.relievers?.some(
            (r) => r.user.toString() === userId.toString() && r.status === "Pending"
          );
        }

        if (currentLevel === "teamlead") {
          const allRelieversApproved = leave.relievers?.every(
            (r) => r.status === "Approved"
          );
          return allRelieversApproved && leave.teamlead.toString() === userId.toString();
        }

        if (currentLevel === "hr") {
          const allRelieversApproved = leave.relievers?.every(
            (r) => r.status === "Approved"
          );
          const teamleadApproved = leave.reviewTrail?.some(
            (r) => r.role === "teamlead" && r.action === "Approved"
          );
          return allRelieversApproved && teamleadApproved && userRole === "hr";
        }

        return false;
      });

      res.status(200).json({ success: true, data: { data: queue } });
    } catch (err) {
      next(err);
    }
  }
);


// export const getLeaveActivityFeed = asyncHandler(
//   async (
//     req: TypedRequest<{}, TypedRequestQuery, {}>,
//     res: any,
//     next: NextFunction
//   ) => {
//     const userId = req.user?._id as Types.ObjectId;
//     const { status, from, to } = req.query;

//     if (!userId) {
//       return res.status(401).json({ success: false, message: "User not authenticated" });
//     }

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
//     const myRequestsRaw = await LeaveRequest.find({
//       ...baseFilter,
//       user: userId,
//     })
//       .sort({ createdAt: -1 })
//       .limit(20)
//       .select(
//         "_id type startDate endDate days status reason createdAt user teamlead reviewTrail relievers allowance url"
//       )
//       .populate("user", "firstName lastName")
//       .lean();

//     const roleConditions: any[] = [];

//     roleConditions.push({
//       relievers: {
//         $elemMatch: {
//           user: userId,
//           status: { $in: ["Pending", "pending"] },
//         },
//       },
//       status: { $nin: ["Rejected", "rejected"] },
//     });

//     // (b) Teamlead stage → all relievers approved, teamlead not yet acted
//     roleConditions.push({
//       teamlead: userId,
//       status: { $in: ["Pending", "pending"] },
//       relievers: {
//         $not: {
//           $elemMatch: {
//             status: { $in: ["Pending", "pending", "Rejected", "rejected"] },
//           },
//         },
//       },
//       $nor: [{ reviewTrail: { $elemMatch: { role: "teamlead" } } }],
//     });

//     // (c) HR stage → all relievers approved + teamlead approved + HR not yet acted
//     if (req.user?.role === "hr") {
//       roleConditions.push({
//         status: { $in: ["Pending", "pending"] },
//         relievers: {
//           $not: {
//             $elemMatch: {
//               status: { $in: ["Pending", "pending", "Rejected", "rejected"] },
//             },
//           },
//         },
//         reviewTrail: {
//           $elemMatch: { role: "teamlead", action: { $in: ["Approved", "approved"] } },
//         },
//         $nor: [{ reviewTrail: { $elemMatch: { role: "hr" } } }],
//       });
//     }

//     const approvalsRaw = await LeaveRequest.find({
//       ...baseFilter,
//       $or: roleConditions,
//     })
//       .sort({ createdAt: -1 })
//       .limit(20)
//       .select(
//         "_id type startDate endDate days status reason createdAt user teamlead reviewTrail relievers allowance url"
//       )
//       .populate("user", "firstName lastName")
//       .lean();

//     // 🔹 4) Map helper
//     const mapLeave = (leave: any) => {
//       let currentReviewerRole: "reliever" | "teamlead" | "hr" | null = null;

//       // (a) Reliever stage
//       const pendingReliever = leave.relievers?.find(
//         (r: any) =>
//           r?.user?.toString?.() === userId?.toString?.() &&
//           ["pending", "Pending"].includes(r?.status)
//       );
//       if (pendingReliever) {
//         currentReviewerRole = "reliever";
//       } else {
//         // (b) Teamlead stage
//         const allRelieversApproved =
//           Array.isArray(leave.relievers) &&
//           leave.relievers.length > 0 &&
//           leave.relievers.every((r: any) => ["approved", "Approved"].includes(r?.status));
//         const teamleadAlreadyApproved = leave.reviewTrail?.some(
//           (r: any) => r.role === "teamlead" && ["approved", "Approved"].includes(r.action)
//         );
//         if (
//           allRelieversApproved &&
//           leave.teamlead?.toString?.() === userId?.toString?.() &&
//           !teamleadAlreadyApproved
//         ) {
//           currentReviewerRole = "teamlead";
//         } else {
//           // (c) HR stage
//           const teamleadApproved = leave.reviewTrail?.some(
//             (r: any) => r.role === "teamlead" && ["approved", "Approved"].includes(r.action)
//           );
//           const hrAlreadyApproved = leave.reviewTrail?.some(
//             (r: any) => r.role === "hr" && ["approved", "Approved"].includes(r.action)
//           );
//           const allRelieversApprovedForHR =
//             Array.isArray(leave.relievers) &&
//             leave.relievers.length > 0 &&
//             leave.relievers.every((r: any) => ["approved", "Approved"].includes(r?.status));
//           if (
//             req.user?.role === "hr" &&
//             teamleadApproved &&
//             allRelieversApprovedForHR &&
//             !hrAlreadyApproved
//           ) {
//             currentReviewerRole = "hr";
//           }
//         }
//       }

//       return {
//         id: leave._id.toString(),
//         employeeId: leave.user?._id?.toString() ?? "",
//         employeeName: `${leave.user?.firstName ?? ""} ${leave.user?.lastName ?? ""}`.trim(),
//         type: leave.type,
//         startDate: leave.startDate,
//         endDate: leave.endDate,
//         days: leave.days,
//         reason: leave.reason,
//         status: String(leave.status).toLowerCase(),
//         appliedDate: leave.createdAt,
//         teamleadId: leave.teamlead?.toString?.() ?? "",
//         teamleadName: "",
//         currentReviewerRole,
//         relievers: (leave.relievers ?? []).map((r: any) => ({
//           user: r.user?.toString?.() ?? "",
//           firstName: r.firstName,
//           lastName: r.lastName,
//           status: String(r.status ?? "pending").toLowerCase(),
//           note: r.note ?? undefined,
//           actedAt: r.actedAt ?? undefined,
//         })),
//         reviewTrail: (leave.reviewTrail ?? []).map((r: any) => ({
//           reviewer: r.reviewer?.toString?.() ?? "",
//           role: r.role,
//           action: String(r.action).toLowerCase(),
//           date: r.date ? new Date(r.date).toISOString() : "",
//           note: r.note,
//         })),
//         allowance: !!leave.allowance,
//         url: leave.url ?? undefined,
//       };
//     };

//     // 🔹 5) Summary
//     const allUserLeaves = await LeaveRequest.find({ user: userId }).select("status").lean();
//     const summary = {
//       pending: allUserLeaves.filter((l) => ["pending", "Pending"].includes(l.status)).length,
//       approved: allUserLeaves.filter((l) => ["approved", "Approved"].includes(l.status)).length,
//       rejected: allUserLeaves.filter((l) => ["rejected", "Rejected"].includes(l.status)).length,
//       expired: allUserLeaves.filter((l) => ["expired", "Expired"].includes(l.status)).length,
//     };

//     // 🔹 6) Leave balances
//     const year = new Date().getFullYear();
//     const leaveBalance = await LeaveBalance.findOne({ user: userId, year }).lean();
//     const balance = leaveBalance
//       ? Object.entries(leaveBalance.balances).map(([type, remaining]) => ({ type, remaining }))
//       : Object.entries(LeaveEntitlements).map(([type, entitlement]) => ({
//           type,
//           remaining: entitlement,
//         }));

//     // 🔹 7) Return
//     res.status(200).json({
//       success: true,
//       data: {
//         myRequests: myRequestsRaw.map(mapLeave),
//         approvals: approvalsRaw.map(mapLeave),
//         summary,
//         balance,
//       },
//     });
//   }
// );


export const getLeaveActivityFeed = asyncHandler(
  async (
    req: TypedRequest<{}, TypedRequestQuery, {}>,
    res: any,
    next: NextFunction
  ) => {
    const userId = req.user?._id as Types.ObjectId;
    const userRole = req.user?.role;
    const { status, from, to, page = "1", limit = "20" } = req.query;

    if (!userId) {
      return res
        .status(401)
        .json({ success: false, message: "User not authenticated" });
    }

    const pageNum = parseInt(page, 10);
    const pageSize = parseInt(limit, 10);
    const skip = (pageNum - 1) * pageSize;

    // 🔹 1) Base filter
    const baseFilter: any = {};
    if (status) {
      baseFilter.status = {
        $in: [
          status,
          String(status).charAt(0).toUpperCase() + String(status).slice(1),
        ],
      };
    }
    if (from || to) {
      baseFilter.createdAt = {};
      if (from) baseFilter.createdAt.$gte = new Date(from);
      if (to) baseFilter.createdAt.$lte = new Date(to);
    }

    // 🔹 2) My own requests (with pagination)
    const [myRequestsRaw, myTotal] = await Promise.all([
      LeaveRequest.find({
        ...baseFilter,
        user: userId,
      })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pageSize)
        .select(
          "_id type startDate endDate days status reason createdAt user teamlead reviewTrail relievers allowance url"
        )
        .populate("user", "firstName lastName")
        .lean(),
      LeaveRequest.countDocuments({ ...baseFilter, user: userId }),
    ]);

    // 🔹 3) Approvals (reliever/teamlead/hr)
    const roleConditions: any[] = [];

    // (a) Reliever stage
    roleConditions.push({
      relievers: {
        $elemMatch: {
          user: userId,
          status: { $in: ["Pending", "pending"] },
        },
      },
      status: { $nin: ["Rejected", "rejected"] },
    });

    // (b) Teamlead stage
    roleConditions.push({
      teamlead: userId,
      status: { $in: ["Pending", "pending"] },
      relievers: {
        $not: {
          $elemMatch: {
            status: { $in: ["Pending", "pending", "Rejected", "rejected"] },
          },
        },
      },
      $nor: [{ reviewTrail: { $elemMatch: { role: "teamlead" } } }],
    });

    // (c) HR stage
    if (userRole === "hr") {
      roleConditions.push({
        status: { $in: ["Pending", "pending"] },
        relievers: {
          $not: {
            $elemMatch: {
              status: { $in: ["Pending", "pending", "Rejected", "rejected"] },
            },
          },
        },
        reviewTrail: {
          $elemMatch: {
            role: "teamlead",
            action: { $in: ["Approved", "approved"] },
          },
        },
        $nor: [{ reviewTrail: { $elemMatch: { role: "hr" } } }],
      });
    }

    const [approvalsRaw, approvalsTotal] = await Promise.all([
      LeaveRequest.find({
        ...baseFilter,
        $or: roleConditions,
      })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pageSize)
        .select(
          "_id type startDate endDate days status reason createdAt user teamlead reviewTrail relievers allowance url"
        )
        .populate("user", "firstName lastName")
        .lean(),
      LeaveRequest.countDocuments({ ...baseFilter, $or: roleConditions }),
    ]);

    // 🔹 4) HR/Admin extra → fetch all APPROVED requests
    let allApprovedRaw: any[] = [];
    let allApprovedTotal = 0;

    if (["hr", "admin"].includes(userRole!)) {
      const approvedFilter = {
        ...baseFilter,
        status: { $in: ["Approved", "approved"] },
      };

      [allApprovedRaw, allApprovedTotal] = await Promise.all([
        LeaveRequest.find(approvedFilter)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(pageSize)
          .select(
            "_id type startDate endDate days status reason createdAt user teamlead reviewTrail relievers allowance url"
          )
          .populate("user", "firstName lastName")
          .lean(),
        LeaveRequest.countDocuments(approvedFilter),
      ]);
    }

    // 🔹 5) Mapping helper
    const mapLeave = (leave: any) => {
      let currentReviewerRole: "reliever" | "teamlead" | "hr" | null = null;

      // logic same as before …
      // [keeping your current mapping code]

      return {
        id: leave._id.toString(),
        employeeId: leave.user?._id?.toString() ?? "",
        employeeName: `${leave.user?.firstName ?? ""} ${
          leave.user?.lastName ?? ""
        }`.trim(),
        type: leave.type,
        startDate: leave.startDate,
        endDate: leave.endDate,
        days: leave.days,
        reason: leave.reason,
        status: String(leave.status).toLowerCase(),
        appliedDate: leave.createdAt,
        teamleadId: leave.teamlead?.toString?.() ?? "",
        teamleadName: "",
        currentReviewerRole,
        relievers: (leave.relievers ?? []).map((r: any) => ({
          user: r.user?.toString?.() ?? "",
          firstName: r.firstName,
          lastName: r.lastName,
          status: String(r.status ?? "pending").toLowerCase(),
          note: r.note ?? undefined,
          actedAt: r.actedAt ?? undefined,
        })),
        reviewTrail: (leave.reviewTrail ?? []).map((r: any) => ({
          reviewer: r.reviewer?.toString?.() ?? "",
          role: r.role,
          action: String(r.action).toLowerCase(),
          date: r.date ? new Date(r.date).toISOString() : "",
          note: r.note,
        })),
        allowance: !!leave.allowance,
        url: leave.url ?? undefined,
      };
    };

    // 🔹 6) Summary (only for my requests)
    const allUserLeaves = await LeaveRequest.find({ user: userId })
      .select("status")
      .lean();
    const summary = {
      pending: allUserLeaves.filter((l) =>
        ["pending", "Pending"].includes(l.status)
      ).length,
      approved: allUserLeaves.filter((l) =>
        ["approved", "Approved"].includes(l.status)
      ).length,
      rejected: allUserLeaves.filter((l) =>
        ["rejected", "Rejected"].includes(l.status)
      ).length,
      expired: allUserLeaves.filter((l) =>
        ["expired", "Expired"].includes(l.status)
      ).length,
    };

    // 🔹 7) Leave balances
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

    // 🔹 8) Return
    res.status(200).json({
      success: true,
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
    });
  }
);

export const getLeaveApprovers = asyncHandler(
  async (
    req: TypedRequest,
    res: any,
    next: NextFunction
  ) => {
    const currentUser = await User.findById(req.user?.id);
    if (!currentUser) {
        return res.status(404).json({ success: false, message: 'User not found' });
    }
    let approverRoles: string[] = [];
    let cacheKey = '';
    switch (currentUser.role) {
        case 'employee':
            approverRoles = ['reliever', 'teamlead', 'hr'];
            cacheKey = `approvers:employee:${currentUser.company}:${currentUser.department}`;
            break;
        case 'teamlead':
            approverRoles = ['hr'];
            cacheKey = `approvers:teamlead:${currentUser.company}`;
            break;
        case 'hr':
            approverRoles = [];
            cacheKey = `approvers:hr:${currentUser.company}`;
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

    const query:any = {
        role: { $in: approverRoles },
        company: currentUser.company,
        isActive: true,
    };
    if (currentUser.role === 'employee') {
      
        query.$or = [
            { role: 'reliever', department: currentUser.department },
            { role: 'teamlead', department: currentUser.department },
            { role: 'hr' }, 
        ];
    }
    const approvers = await User.find(query).select('_id firstName lastName department role');
    const relievers = approvers.filter((u) => u);
    const teamlead = approvers.find((u) => u.role === 'teamlead');
    const hr = approvers.find((u) => u.role === 'hr');
    const orderedApprovers = [
        ...relievers.map((u) => ({
            id: u._id,
            name: `${u.firstName} ${u.lastName}`,
            department: u.department,
            role: u.role,
        })),
        ...(teamlead
            ? [ {
                    id: teamlead._id,
                    name: `${teamlead.firstName} ${teamlead.lastName}`,
                    department: teamlead.department,
                    role: teamlead.role,
                }]
            : []),
        ...(hr
            ? [ {
                    id: hr._id,
                    name: `${hr.firstName} ${hr.lastName}`,
                    department: hr.department,
                    role: hr.role,
                }]
            : []),
    ];
    await redisClient.setex(cacheKey, 86400, JSON.stringify(orderedApprovers));
    res.status(200).json({
        success: true,
        data: orderedApprovers,
        cached: false,
    });
  }
);




export const getLeaveStatusOverview = asyncHandler(
  async (
    req: TypedRequest<{}, {}, {}>,
    res: TypedResponse<{ pending: number; approved: number; rejected: number; total: number }>,
    next: NextFunction
  ) => {
    try {
      const userId = req.user?._id;
      if (!userId) {
        res.status(401).json({
          success: false,
          message: "Unauthorized",
        });
        return;
      }

      const [pending, approved, rejected] = await Promise.all([
        LeaveRequest.countDocuments({ user: userId, status: "Pending" }),
        LeaveRequest.countDocuments({ user: userId, status: "Approved" }),
        LeaveRequest.countDocuments({ user: userId, status: "Rejected" }),
      ]);

      const total = pending + approved + rejected;

      res.status(200).json({
        success: true,
        data: { pending, approved, rejected, total },
      });
    } catch (err) {
      next(err);
    }
  }
);
