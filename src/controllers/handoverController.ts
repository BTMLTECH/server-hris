
import { sendNotification } from '../utils/sendNotification';
import { logAudit } from '../utils/logAudit';
import { NextFunction } from 'express';
import { asyncHandler } from "../middleware/asyncHandler";
import { TypedRequest } from "../types/typedRequest";
import { TypedResponse } from "../types/typedResponse";
import HandoverReport, { IHandoverReport } from "../models/HandoverReport";
import User, { IUser } from '../models/user.model';
import { CreateHandoverDTO, MyHandoverReports } from '../types/handoverType';
import { Types } from 'mongoose';
import { uploadToCloudinary } from '../utils/cloudinary';
import ErrorResponse from '../utils/ErrorResponse';

export const createHandoverReport = asyncHandler(async (
  req: TypedRequest<{}, {}, CreateHandoverDTO>,
  res: TypedResponse<{ data: IHandoverReport }>,
  next: NextFunction
) => {
  const { date, shift, summary, teamlead } = req.body;
  const userId = req.user?._id;
  

  if (!date || !shift || !summary || !teamlead || !req.file ) {
    return next(new Error('All fields including PDF file are required.'));  }


  const pdfResult = await uploadToCloudinary(req.file.buffer, 'btm/documents', 'auto', 'btmlimited');
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
        logoUrl: company?.branding?.logoUrl ,
        primaryColor: company?.branding?.primaryColor || "#0621b6b0",
      }
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
});


// export const getMyHandoverReports = asyncHandler(async (
//   req: TypedRequest<{}, {}>,
//   res: TypedResponse<any>,
//   next: any
// ) => {
//   try {
//     const teamleadId = req.user?.id;

//     console.log(" req.user?.id",  req.user?.id)

//     // if (!teamleadId || req.user?.role !== 'teamlead') {
//     //   return res.status(403).json({ success: false, message: 'Access denied' });
//     // }

//     const reports = await HandoverReport.find({ teamlead: teamleadId })
//       .populate<{ user: IUser }>('user', 'firstName lastName email')
//       .sort({ date: -1 });
      
//     res.status(200).json({
//       success: true,
//       data: {
//         data: reports,
//       },
//     });
//   } catch (err: any) {
//     next(err);
//   }
// });

// GET /api/handover/my
export const getMyHandovers = asyncHandler(
  async (
    req: TypedRequest,
    res: TypedResponse<{ data: IHandoverReport[] }>,
    next: NextFunction
  ) => {

    const userId = req.user?._id;

    const handovers = await HandoverReport.find({ user: userId }).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      message: 'Fetched current user handovers',
      data: { data: handovers },
    });
  }
);

export const getTeamDepartmentHandovers = asyncHandler(
  async (
    req: TypedRequest,
    res: TypedResponse<{ data: IHandoverReport[] }>,
    next: NextFunction
  ) => {
  
    const teamleadId = req.user?._id;

    const teamlead = await User.findById(teamleadId);

    if (!teamlead) {
      return next(new ErrorResponse("Teamlead not found", 404));
    }

    // Step 1: Find employees in the same department
    const employees = await User.find({
      department: teamlead.department,
      role: "employee",
    }).select("_id");

    const employeeIds = employees.map((emp) => emp._id);

    // Step 2: Get handovers submitted by those employees
    const handovers = await HandoverReport.find({
      user: { $in: employeeIds },
    }).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      message: "Handovers from employees in your department",
      data: { data: handovers },
    });
  }
);

export const deleteHandoverById = 
  async (
    req: TypedRequest<{ id: string }>,
    res: TypedResponse<{ message: string }>,
    next: NextFunction
  ) => {
    const handoverId = req.params.id;

    const handover = await HandoverReport.findById(handoverId);

    if (!handover) {
      return next(new ErrorResponse('Handover report not found', 404));
    }

    await handover.deleteOne();

    await logAudit({
      userId: req.user?._id,
      action: 'DELETE_HANDOVER_REPORT',
      status: 'SUCCESS',
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.status(200).json({
      success: true,
      message: 'Handover report deleted successfully',
    });
  }
;




// export const approveHandoverReport = async (
//   req: TypedRequest<{ id: string }>,
//   res: any,
//   next: any
// ) => {
//   try {
//     const { id } = req.params;
//     const reviewer = req.user;
//     const reviewerId = reviewer?._id as Types.ObjectId;
    

//     const report = await HandoverReport.findById(id).populate('user', 'firstName email');

//     if (!report) return res.status(404).json({ success: false, message: 'Report not found' });
//     if (report.status !== 'pending') return res.status(400).json({ success: false, message: 'Report already reviewed' });

//     if (!reviewer || reviewer.role !== 'teamlead' || !report.teamlead.equals(reviewerId)) {
//       return res.status(403).json({ success: false, message: 'Access denied' });
//     }

//     report.status = 'approved';
//     await report.save();

//     res.status(200).json({ success: true, message: 'Handover report approved', data: report });

//   } catch (err: any) {
//     next(err);
//   }
// };


// export const rejectHandoverReport = async (
//   req: TypedRequest<{ id: string }, {}, { note?: string }>,
//   res: any,
//   next: any
// ) => {
//   try {
//     const { id } = req.params;
//     console.log("id", id)
//     const { note } = req.body;
//     const reviewer = req.user;
//     const reviewerId = reviewer?._id as Types.ObjectId;


//     const report = await HandoverReport.findById(id).populate('user', 'firstName email');

//     if (!report) return res.status(404).json({ success: false, message: 'Report not found' });
//     if (report.status !== 'pending') return res.status(400).json({ success: false, message: 'Report already reviewed' });

//     if (!reviewer || reviewer.role !== 'teamlead' || !report.teamlead.equals(reviewerId)) {
//       return res.status(403).json({ success: false, message: 'Access denied' });
//     }

//     report.status = 'rejected';
//     if (note) report.note = note;
//     await report.save();

//     res.status(200).json({ success: true, message: 'Handover report rejected', data: report });

//   } catch (err: any) {
//     next(err);
//   }
// };

