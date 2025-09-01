"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendBirthdayNotifications = void 0;
const asyncHandler_1 = require("../middleware/asyncHandler");
const sendNotification_1 = require("./sendNotification");
const user_model_1 = __importDefault(require("../models/user.model"));
exports.sendBirthdayNotifications = (0, asyncHandler_1.asyncHandler)(async (req, res, next) => {
    const company = req.company;
    const companyId = company?._id;
    if (!companyId)
        return next(new Error('Company not found'));
    const today = new Date();
    const currentMonth = today.getMonth() + 1;
    const currentDate = today.getDate();
    // Find users whose birthday is today
    const birthdayUsers = await user_model_1.default.find({
        company: companyId,
        dateOfBirth: { $exists: true },
    });
    const celebrants = birthdayUsers.filter(u => {
        const dob = new Date(u.dateOfBirth);
        return dob.getDate() === currentDate && dob.getMonth() + 1 === currentMonth;
    });
    // Send notifications
    for (const user of celebrants) {
        await (0, sendNotification_1.sendNotification)({
            user,
            type: 'INFO',
            title: '🎉 Happy Birthday!',
            message: `Happy Birthday ${user.firstName}! Wishing you a wonderful day!`,
            emailSubject: `Happy Birthday ${user.firstName}!`,
            emailTemplate: 'birthday.ejs',
            emailData: {
                name: user.firstName,
                companyName: company?.branding?.displayName || company?.name,
                logoUrl: company?.branding?.logoUrl,
            },
        });
    }
    res.status(200).json({
        success: true,
        message: `${celebrants.length} birthday notification(s) sent.`,
        data: celebrants.map(u => ({ name: u.firstName, email: u.email })),
    });
});
