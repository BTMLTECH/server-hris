import { NextFunction } from 'express';
import { TypedRequest } from '../types/typedRequest';
import { TypedResponse } from '../types/typedResponse';
import ErrorResponse from '../utils/ErrorResponse';
import Company from '../models/Company';
import { AuthData } from '../types/auth';

export const tenantAuth = async (
  req: TypedRequest,
  _: TypedResponse<AuthData>,
  next: NextFunction,
) => {
  try {
    if (!req.user || !req.user.company) {

      return next(new ErrorResponse('No company context found or not authenticated', 404));
    }

    const company = await Company.findById(req.user.company);

    if (!company) {
      return next(new ErrorResponse('Company not found', 404));
    }

    req.company = company;
    next();
  } catch (err: any) {
    next(new ErrorResponse(err.message || 'Server error', 500));
  }
};
