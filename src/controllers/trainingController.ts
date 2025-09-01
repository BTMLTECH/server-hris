"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAllTrainings = exports.submitFeedback = exports.createTraining = void 0;
const Training_1 = require("../models/Training");
const asyncHandler_1 = require("../middleware/asyncHandler");
const defaultQuestion_1 = require("../utils/defaultQuestion");
const ErrorResponse_1 = __importDefault(require("../utils/ErrorResponse"));
const sendNotification_1 = require("../utils/sendNotification");
const user_model_1 = __importDefault(require("../models/user.model"));
// Create Training and notify participants
exports.createTraining = (0, asyncHandler_1.asyncHandler)(async (req, res, next) => {
    try {
        const companyId = req.company?._id;
        if (!companyId) {
            return next(new ErrorResponse_1.default("Invalid company context", 400));
        }
        // Use current user as trainer if not explicitly provided
        const trainerName = req.body.trainer || `${req.user?.firstName} ${req.user?.lastName}`;
        // Find participants
        const participants = await user_model_1.default.find({
            email: { $in: req.body.participantEmails },
            company: companyId,
            isActive: true
        }).lean();
        // Create training with participant snapshot
        const training = await Training_1.Training.create({
            ...req.body,
            trainer: trainerName,
            company: companyId,
            participants: participants.map(u => ({
                id: u._id,
                firstName: u.firstName,
                middleName: u.middleName,
                lastName: u.lastName,
                email: u.email,
                department: u.department,
                position: u.position,
                role: u.role,
                staffId: u.staffId
            })),
            questions: defaultQuestion_1.DEFAULT_QUESTIONS,
            status: 'pending'
        });
        // Send notifications
        await Promise.all(participants.map(user => (0, sendNotification_1.sendNotification)({
            user,
            type: "INFO",
            title: `New Training: ${training.title}`,
            message: `You have a new training scheduled on ${training.date.toDateString()}. Please submit your feedback after attending.`,
            emailSubject: `Training Notification: ${training.title}`,
            emailTemplate: "training-notification.ejs",
            emailData: {
                name: user.firstName,
                trainingTitle: training.title,
                trainingDate: training.date.toDateString(),
                companyName: req.company?.name
            }
        })));
        res.status(201).json({ success: true, data: training });
    }
    catch (err) {
        next(new ErrorResponse_1.default(err.message, 500));
    }
});
exports.submitFeedback = (0, asyncHandler_1.asyncHandler)(async (req, res, next) => {
    try {
        const training = await Training_1.Training.findById(req.params.id);
        if (!training) {
            return next(new ErrorResponse_1.default("Training not found", 404));
        }
        if (!req.user || !req.user._id) {
            return next(new ErrorResponse_1.default("Unauthorized", 401));
        }
        // Ensure the user is a registered participant
        const participant = training.participants.find((p) => p.id?.toString() ===
            (req.user?._id).toString());
        if (!participant) {
            return next(new ErrorResponse_1.default("You are not registered for this training", 403));
        }
        // Prevent duplicate submissions
        if (participant.status === "submitted") {
            return next(new ErrorResponse_1.default("You have already submitted feedback", 400));
        }
        // Create feedback entry
        training.feedbacks.push({
            user: req.user._id,
            department: req.user.department || "",
            answers: req.body.answers,
            additionalComments: req.body.additionalComments || "",
            submittedAt: new Date(),
            status: "submitted",
        });
        // Update participant status
        participant.status = "submitted";
        // 🔄 Always recalc training status based on participants
        training.status = training.participants.every((p) => p.status === "submitted")
            ? "submitted"
            : "pending";
        await training.save();
        res.status(200).json({
            success: true,
            message: "Feedback submitted successfully",
        });
    }
    catch (err) {
        next(new ErrorResponse_1.default(err.message, 500));
    }
});
exports.getAllTrainings = (0, asyncHandler_1.asyncHandler)(async (req, res, next) => {
    try {
        const userId = req.user?._id?.toString();
        const companyId = req.company?._id?.toString();
        if (!companyId)
            return next(new ErrorResponse_1.default("Invalid company context", 400));
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 30;
        const skip = (page - 1) * limit;
        const query = { company: companyId };
        if (req.query.department)
            query.department = req.query.department;
        let trainings = await Training_1.Training.find(query)
            .sort({ date: -1 })
            .skip(skip)
            .limit(limit)
            .populate("feedbacks.user", "firstName lastName email department")
            .lean();
        // ---------- ROLE BASED FILTERING ----------
        if (req.user?.role === "employee" && userId) {
            // ✅ Employee → only trainings where they are a participant
            trainings = trainings
                .filter(t => t.participants.some(p => p.id?.toString() === userId))
                .map(t => ({
                ...t,
                participants: t.participants.filter(p => p.id?.toString() === userId),
                feedbacks: t.feedbacks.filter(f => f.user && f.user._id?.toString() === userId),
            }));
        }
        if (req.user?.role === "teamlead" && req.user?.department) {
            // ✅ Teamlead → only trainings that include at least 1 participant in their department
            trainings = trainings
                .filter(t => t.participants.some(p => p.department === req.user?.department))
                .map(t => ({
                ...t,
                participants: t.participants.filter(p => p.department === req.user?.department),
                feedbacks: t.feedbacks.filter(f => f.department === req.user?.department),
            }));
        }
        if (req.user?.role === "hr") {
            trainings = trainings
                .filter(t => t.status === "submitted")
                .map(t => ({
                ...t,
                feedbacks: t.feedbacks.filter(f => f.status === "submitted"),
            }));
        }
        // ---------- PAGINATION ----------
        const total = await Training_1.Training.countDocuments(query);
        const pages = Math.ceil(total / limit);
        res.status(200).json({
            success: true,
            data: {
                data: trainings,
                pagination: { total, page, limit, pages },
                count: trainings.length,
            },
        });
    }
    catch (err) {
        next(new ErrorResponse_1.default(err.message, 500));
    }
});
