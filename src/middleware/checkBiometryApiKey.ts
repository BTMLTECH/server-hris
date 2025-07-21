import { Request, Response, NextFunction } from 'express';
import ErrorResponse from '../utils/ErrorResponse';

export const checkBiometryApiKey = (req: Request, res: Response, next: NextFunction) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== process.env.BIOMETRY_API_KEY) {
    return next(new ErrorResponse('Unauthorized biometric device', 401));
  }
  next();
};
