// controllers/trainingController.ts
import { NextFunction } from 'express';
import mongoose from 'mongoose';
import { Training } from '../models/Training';
import { asyncHandler } from '../middleware/asyncHandler';
import { TypedRequest } from '../types/typedRequest';
import { TypedResponse } from '../types/typedResponse';
import { DEFAULT_QUESTIONS } from '../utils/defaultQuestion';
import ErrorResponse from '../utils/ErrorResponse';
import { sendNotification } from '../utils/sendNotification';
import User from '../models/user.model';

// Create Training and notify participants
export const createTraining = asyncHandler(
  async (
    req: TypedRequest<
      {},
      {},
      {
        title: string;
        date: Date;
        trainer?: string;
        department: string;
        facilitators: { name: string; email?: string }[];
        noOfTrainees: number;
        participantEmails: string[];
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

      // Use current user as trainer if not explicitly provided
      // const trainerName = req.body.trainer || `${req.user?.firstName} ${req.user?.lastName}`;
      // ✅ Validate facilitators: must at least have one with a name
      if (!req.body.facilitators || req.body.facilitators.length === 0) {
        return next(new ErrorResponse('At least one facilitator is required', 400));
      }

      // Find participants
      const participants = await User.find({
        email: { $in: req.body.participantEmails },
        company: companyId,
        isActive: true,
      }).lean();

      // Create training with participant snapshot
      const training = await Training.create({
        ...req.body,
        // trainer: trainerName,
        company: companyId,
        createdBy: req.user?._id,
        participants: participants.map((u) => ({
          id: u._id,
          firstName: u.firstName,
          middleName: u.middleName,
          lastName: u.lastName,
          email: u.email,
          department: u.department,
          position: u.position,
          role: u.role,
          staffId: u.staffId,
        })),
        questions: DEFAULT_QUESTIONS,
        status: 'pending',
      });

      // Send notifications
      await Promise.all(
        participants.map((user) =>
          sendNotification({
            user,
            type: 'INFO',
            title: `New Training: ${training.title}`,
            message: `You have a new training scheduled on ${training.date.toDateString()}. Please submit your feedback after attending.`,
            emailSubject: `Training Notification: ${training.title}`,
            emailTemplate: 'training-notification.ejs',
            emailData: {
              name: user.firstName,
              trainingTitle: training.title,
              trainingDate: training.date.toDateString(),
              companyName: req.company?.name,
            },
          }),
        ),
      );

      res.status(201).json({ success: true, data: training });
    } catch (err: any) {
      next(new ErrorResponse(err.message, 500));
    }
  },
);

export const submitFeedback = asyncHandler(
  async (
    req: TypedRequest<
      { id?: string },
      {},
      { answers: { question: string; response: string }[]; additionalComments?: string }
    >,
    res: TypedResponse<any>,
    next: NextFunction,
  ) => {
    try {
      const training = await Training.findById(req.params.id);
      if (!training) {
        return next(new ErrorResponse('Training not found', 404));
      }

      if (!req.user || !req.user._id) {
        return next(new ErrorResponse('Unauthorized', 401));
      }

      // Ensure the user is a registered participant
      const participant = training.participants.find(
        (p) => p.id?.toString() === (req.user?._id as mongoose.Types.ObjectId).toString(),
      );

      if (!participant) {
        return next(new ErrorResponse('You are not registered for this training', 403));
      }

      // Prevent duplicate submissions
      if (participant.status === 'submitted') {
        return next(new ErrorResponse('You have already submitted feedback', 400));
      }

      // Create feedback entry
      training.feedbacks.push({
        user: req.user._id as mongoose.Types.ObjectId,
        department: req.user.department || '',
        answers: req.body.answers,
        additionalComments: req.body.additionalComments || '',
        submittedAt: new Date(),
        status: 'submitted',
      });

      // Update participant status
      participant.status = 'submitted';

      // 🔄 Always recalc training status based on participants
      training.status = training.participants.every((p) => p.status === 'submitted')
        ? 'submitted'
        : 'pending';

      await training.save();

      res.status(200).json({
        success: true,
        message: 'Feedback submitted successfully',
      });
    } catch (err: any) {
      next(new ErrorResponse(err.message, 500));
    }
  },
);

// export const getAllTrainings = asyncHandler(
//   async (
//     req: TypedRequest<{}, { page?: string; limit?: string; department?: string }>,
//     res: TypedResponse<any>,
//     next: NextFunction,
//   ) => {
//     try {
//       const userId = req.user?._id?.toString();
//       const companyId = req.company?._id?.toString();
//       if (!companyId) return next(new ErrorResponse('Invalid company context', 400));

//       const page = parseInt(req.query.page as string) || 1;
//       const limit = parseInt(req.query.limit as string) || 30;
//       const skip = (page - 1) * limit;

//       const query: any = { company: companyId };
//       if (req.query.department) query.department = req.query.department;

//       let trainings = await Training.find(query)
//         .sort({ date: -1 })
//         .skip(skip)
//         .limit(limit)
//         .populate('feedbacks.user', 'firstName lastName email department')
//         .lean();

//       // ---------- ROLE BASED FILTERING ----------
//       if (req.user?.role === 'employee' && userId) {
//         // ✅ Employee → only trainings where they are a participant
//         trainings = trainings
//           .filter((t) => t.participants.some((p) => p.id?.toString() === userId))
//           .map((t) => ({
//             ...t,
//             participants: t.participants.filter((p) => p.id?.toString() === userId),
//             feedbacks: t.feedbacks.filter((f) => f.user && f.user._id?.toString() === userId),
//           }));
//       }

//       if (req.user?.role === 'teamlead' && req.user?.department) {
//         // ✅ Teamlead → only trainings that include at least 1 participant in their department
//         trainings = trainings
//           .filter((t) => t.participants.some((p) => p.department === req.user?.department))
//           .map((t) => ({
//             ...t,
//             participants: t.participants.filter((p) => p.department === req.user?.department),
//             feedbacks: t.feedbacks.filter((f) => f.department === req.user?.department),
//           }));
//       }

//       if (req.user?.role === 'hr') {
//         trainings = trainings
//           .filter((t) => t.status === 'submitted')
//           .map((t) => ({
//             ...t,
//             feedbacks: t.feedbacks.filter((f) => f.status === 'submitted'),
//           }));
//       }

//       // ---------- PAGINATION ----------
//       const total = await Training.countDocuments(query);
//       const pages = Math.ceil(total / limit);

//       res.status(200).json({
//         success: true,
//         data: {
//           data: trainings,
//           pagination: { total, page, limit, pages },
//           count: trainings.length,
//         },
//       });
//     } catch (err: any) {
//       next(new ErrorResponse(err.message, 500));
//     }
//   },
// );
export const getAllTrainings = asyncHandler(
  async (
    req: TypedRequest<
      {},
      { page?: string; limit?: string; department?: string; facilitator?: string }
    >,
    res: TypedResponse<any>,
    next: NextFunction,
  ) => {
    try {
      const userId = req.user?._id?.toString();
      const companyId = req.company?._id?.toString();
      if (!companyId) return next(new ErrorResponse('Invalid company context', 400));

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 30;
      const skip = (page - 1) * limit;

      const query: any = { company: companyId };
      if (req.query.department) query.department = req.query.department;

      // ✅ Optional: Filter by facilitator name or email
      if (req.query.facilitator) {
        const facilitatorRegex = new RegExp(req.query.facilitator, 'i');
        query.$or = [
          { 'facilitators.name': facilitatorRegex },
          { 'facilitators.email': facilitatorRegex },
        ];
      }

      let trainings = await Training.find(query)
        .sort({ date: -1 })
        .skip(skip)
        .limit(limit)
        .populate('feedbacks.user', 'firstName lastName email department')
        .lean();

      // ---------- USER-BASED FILTERING ----------
      if (userId) {
        trainings = trainings.filter(
          (t) =>
            t.createdBy?.toString() === userId || // ✅ trainings they created
            t.participants.some((p) => p.id?.toString() === userId), // ✅ or participated in
        );
      }

      // ---------- ROLE-BASED FILTERING ----------
      if (req.user?.role === 'employee' && userId) {
        // ✅ Employee → only trainings where they are a participant
        trainings = trainings
          .filter((t) => t.participants.some((p) => p.id?.toString() === userId))
          .map((t) => ({
            ...t,
            participants: t.participants.filter((p) => p.id?.toString() === userId),
            feedbacks: t.feedbacks.filter((f) => f.user && f.user._id?.toString() === userId),
          }));
      }

      if (req.user?.role === 'teamlead' && req.user?.department) {
        // ✅ Teamlead → trainings with at least one participant in their department
        trainings = trainings
          .filter((t) => t.participants.some((p) => p.department === req.user?.department))
          .map((t) => ({
            ...t,
            participants: t.participants.filter((p) => p.department === req.user?.department),
            feedbacks: t.feedbacks.filter((f) => f.department === req.user?.department),
          }));
      }

      if (req.user?.role === 'hr') {
        trainings = trainings
          .filter((t) => t.status === 'submitted')
          .map((t) => ({
            ...t,
            feedbacks: t.feedbacks.filter((f) => f.status === 'submitted'),
          }));
      }

      // ---------- PAGINATION ----------
      const total = await Training.countDocuments(query);
      const pages = Math.ceil(total / limit);

      res.status(200).json({
        success: true,
        data: {
          data: trainings,
          pagination: { total, page, limit, pages },
          count: trainings.length,
        },
      });
    } catch (err: any) {
      next(new ErrorResponse(err.message, 500));
    }
  },
);
