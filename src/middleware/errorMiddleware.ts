import { NextFunction, Request, Response } from 'express';
import ErrorResponse from '../utils/ErrorResponse';

export const ErrorMiddleware = (err: any, req: Request, res: Response, next: NextFunction) => {
  // const isProd = process.env.NODE_ENV === 'production';
  err.statusCode = err.statusCode || 500;
  err.message = err.message || 'Internal server error';

  //wrong mongoDb id error
  if (err.name === 'CastError') {
    const message = `Resource not found. Invalid:${err.path}`;
    err = new ErrorResponse(message, 404);
  }

  //Duplicate key error
  if (err.code === 11000) {
    const message = `Dublicate ${Object.keys(err.value)} entered`;
    err = new ErrorResponse(message, 404);
  }
  //wrong jwt  error
  if (err.name === 'JsonWebTokenError') {
    const message = `Json web token is invalid, try again`;
    err = new ErrorResponse(message, 404);
  }
  //Jwt expire error
  if (err.name === 'TokenExpiredError') {
    const message = `Json web token is expired, try again`;
    err = new ErrorResponse(message, 404);
  }

  // if (!isProd) {
  //   console.error(err);
  // }

  res.status(err.statusCode).json({
    success: false,
    message: err.message,
  });
};
