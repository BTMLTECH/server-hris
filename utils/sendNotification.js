"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendNotification = void 0;
const Notification_1 = __importDefault(require("../models/Notification"));
const emailUtil_1 = require("./emailUtil");
const sendNotification = async ({ user, type, title, message, metadata, emailSubject, emailTemplate, emailData, }) => {
    const notification = await Notification_1.default.create({
        user: user._id,
        type,
        title,
        message,
        metadata,
        read: false,
    });
    // 2. Send email if provided
    if (emailSubject && emailTemplate) {
        await (0, emailUtil_1.sendEmail)(user.email, emailSubject, emailTemplate, {
            name: user.firstName,
            ...emailData,
        });
    }
    const io = globalThis.io;
    if (io && user._id) {
        const roomId = user._id.toString();
        io.to(roomId).emit('notification:new', notification.toObject());
    }
    return notification;
};
exports.sendNotification = sendNotification;
