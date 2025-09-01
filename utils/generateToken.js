"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendToken = exports.refreshTokenOption = exports.accessTokenOption = void 0;
const user_model_1 = __importDefault(require("../models/user.model"));
const redisClient_1 = require("./redisClient");
const ErrorResponse_1 = __importDefault(require("./ErrorResponse"));
require("dotenv").config();
const accessTokenExpire = parseInt(process.env.ACCESS_TOKEN_EXPIRE || "1", 10); // Default to 1 day
const refreshTokenExpire = parseInt(process.env.REFRESH_TOKEN_EXPIRE || "7", 10); // Default to 7 days
const isProd = process.env.NODE_ENV === 'production';
exports.accessTokenOption = {
    expires: new Date(Date.now() + accessTokenExpire * 24 * 60 * 60 * 1000), // 1 day expiry
    maxAge: accessTokenExpire * 24 * 60 * 60 * 1000, // 1 day in milliseconds
    httpOnly: true,
    sameSite: isProd ? "none" : "lax",
    secure: isProd
};
exports.refreshTokenOption = {
    expires: new Date(Date.now() + refreshTokenExpire * 24 * 60 * 60 * 1000), // 7 days expiry
    maxAge: refreshTokenExpire * 24 * 60 * 60 * 1000, // 7 days in milliseconds
    httpOnly: true,
    sameSite: isProd ? "none" : "lax",
    secure: isProd
};
const sendToken = async (user, statusCode, res, next) => {
    const access_token = user.SignAccessToken();
    const refresh_token = user.SignRefreshToken();
    // Fetch full user without password
    const dbUser = await user_model_1.default.findById(user._id).select("-password");
    if (!dbUser) {
        return next(new ErrorResponse_1.default("User not found", 404));
    }
    const fullUser = dbUser.toObject(); // Convert to plain JS object
    // Build session payload
    const sessionData = {
        ...fullUser,
        createdAt: Date.now(),
    };
    // Store in Redis with expiry (e.g., same as refresh token)
    await redisClient_1.redisClient.setex(`session:${user._id}`, exports.refreshTokenOption.maxAge / 1000, // expiry in seconds
    JSON.stringify(sessionData));
    res.cookie("access_token", access_token, exports.accessTokenOption);
    res.cookie("refresh_token", refresh_token, exports.refreshTokenOption);
    res.status(statusCode).json({
        success: true,
        data: {
            user: fullUser
        },
    });
};
exports.sendToken = sendToken;
