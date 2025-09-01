"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkBiometryApiKey = void 0;
const ErrorResponse_1 = __importDefault(require("../utils/ErrorResponse"));
const checkBiometryApiKey = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey || apiKey !== process.env.BIOMETRY_API_KEY) {
        return next(new ErrorResponse_1.default('Unauthorized biometric device', 401));
    }
    next();
};
exports.checkBiometryApiKey = checkBiometryApiKey;
