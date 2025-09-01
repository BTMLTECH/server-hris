"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ErrorMiddleware = void 0;
const ErrorResponse_1 = __importDefault(require("../utils/ErrorResponse"));
const ErrorMiddleware = (err, req, res, next) => {
    err.statusCode = err.statusCode || 500;
    err.message = err.message || "Internal server error";
    //wrong mongoDb id error
    if (err.name === "CastError") {
        const message = `Resource not found. Invalid:${err.path}`;
        err = new ErrorResponse_1.default(message, 404);
    }
    if (err.code === 11000) {
        const keys = err.keyValue ? Object.keys(err.keyValue) : [];
        const message = `Duplicate ${keys.join(', ')} entered`;
        err = new ErrorResponse_1.default(message, 400);
    }
    //wrong jwt  error
    if (err.name === "JsonWebTokenError") {
        const message = `Json web token is invalid, try again`;
        err = new ErrorResponse_1.default(message, 404);
    }
    //Jwt expire error
    if (err.name === "TokenExpiredError") {
        const message = `Json web token is expired, try again`;
        err = new ErrorResponse_1.default(message, 404);
    }
    res.status(err.statusCode).json({
        success: false,
        message: err.message,
    });
};
exports.ErrorMiddleware = ErrorMiddleware;
