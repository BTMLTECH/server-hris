import { NextFunction, Request, Response } from 'express';
import ErrorResponse from '../utils/ErrorResponse';
import multer from 'multer';

// export const ErrorMiddleware = (err: any, _req: Request, res: Response, _next: NextFunction) => {
//   // const isProd = process.env.NODE_ENV === 'production';
//   err.statusCode = err.statusCode || 500;
//   err.message = err.message || 'Internal server error';

//   //wrong mongoDb id error
//   if (err.name === 'CastError') {
//     const message = `Resource not found. Invalid:${err.path}`;
//     err = new ErrorResponse(message, 404);
//   }

//   //Duplicate key error
//   if (err.code === 11000) {
//     const message = `Dublicate ${Object.keys(err.value)} entered`;
//     err = new ErrorResponse(message, 404);
//   }

//   //  if (err.code === 11000 && err.keyValue) {
//   // const field = Object.keys(err.keyValue)[0];
//   //   err = new ErrorResponse(`Duplicate ${field} entered`, 400);
//   // }
 

//   //wrong jwt  error
//   if (err.name === 'JsonWebTokenError') {
//     const message = `Json web token is invalid, try again`;
//     err = new ErrorResponse(message, 404);
//   }
//   //Jwt expire error
//   if (err.name === 'TokenExpiredError') {
//     const message = `Json web token is expired, try again`;
//     err = new ErrorResponse(message, 404);
//   }

//   res.status(err.statusCode).json({
//     success: false,
//     message: err.message,
//   });
// };
export const ErrorMiddleware = (err: any, _req: Request, res: Response, _next: NextFunction) => {
  // ✅ HANDLE MULTER ERRORS FIRST
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File too large. Maximum allowed size is 1MB.',
      });
    }

    return res.status(400).json({
      success: false,
      message: err.message,
    });
  }

  // ❌ Invalid file type error from fileFilter
  if (err.message === 'Only PDF, image, Excel, or CSV files are allowed') {
    return res.status(400).json({
      success: false,
      message: err.message,
    });
  }

  // ------------------------------------------------
  // EXISTING LOGIC (unchanged)
  // ------------------------------------------------

  err.statusCode = err.statusCode || 500;
  err.message = err.message || 'Internal server error';

  if (err.name === 'CastError') {
    err = new ErrorResponse(`Resource not found. Invalid:${err.path}`, 404);
  }

  if (err.code === 11000) {
    err = new ErrorResponse(`Duplicate ${Object.keys(err.value)} entered`, 404);
  }

  if (err.name === 'JsonWebTokenError') {
    err = new ErrorResponse(`Json web token is invalid, try again`, 404);
  }

  if (err.name === 'TokenExpiredError') {
    err = new ErrorResponse(`Json web token is expired, try again`, 404);
  }

  res.status(err.statusCode).json({
    success: false,
    message: err.message,
  });
};
