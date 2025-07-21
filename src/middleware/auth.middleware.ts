import jwt, { JwtPayload } from "jsonwebtoken";
import { Request, Response, NextFunction } from 'express';
import ErrorResponse from '../utils/ErrorResponse';
import User from '../models/user.model';
import { redisClient } from '../utils/redisClient';
import { TypedResponse } from '../types/typedResponse';
import { TypedRequest } from '../types/typedRequest';
import { AuthData } from '../types/auth';
import { ICompany } from '../models/Company';
import { asyncHandler } from "./asyncHandler";


export const isTokenBlacklisted = async (token: string): Promise<boolean> => {
  const blacklisted = await redisClient.get(`bl:${token}`);
  return !!blacklisted;
};

export const protect = async (
  req: TypedRequest,
  res: TypedResponse<AuthData>,
  next: NextFunction
) => {
  let token;


  // ✅ First check the Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  }

  // ✅ Then fallback to cookie if Authorization header is missing
  if (!token && req.cookies?.access_token) {
    token = req.cookies.access_token;
  }

  if (!token) {
    return next(new ErrorResponse('No token provided', 401));
  }

  // ✅ Optional: token blacklist check
  if (await isTokenBlacklisted(token)) {
    return next(new ErrorResponse('Token has been revoked', 401));
  }

  try {
    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN as string) as {
      id: string;
      exp: number;
    };

    const user = await User.findById(decoded.id).populate('company');
    if (!user) {
      return next(new ErrorResponse('User not found', 404));
    }

    req.user = user;
    req.company = user.company as unknown as ICompany;
    next();
  } catch (err) {
    return next(new ErrorResponse('Invalid token', 401));
  }
};

export const authorizeRoles =
  (...roles: string[]) =>
  (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;

    if (!user) {
      return next(new ErrorResponse('Not authorized, no user attached', 401));
    }

    if (roles.length === 0 || roles.includes('all')) {
      return next(); // ✅ allow all authenticated users
    }

    if (!roles.includes(user.role)) {
      return next(
        new ErrorResponse(
          `User role '${user.role}' is not authorized to access this route`,
          403
        )
      );
    }

    next();
  };

// 👥 Allows all core roles
export const allowAllRoles = authorizeRoles('admin', 'hr', 'md', 'teamlead', 'employee');

// 👤 Only admins
export const allowAdminOnly = authorizeRoles('admin');

// 👤 admins and hr
export const allowAdminAndHR = authorizeRoles('admin', 'hr');

// 👤 mds and adminMdAndAbove = authorizeRoles('admin', 'md');

export const allowTeamLeadHRManager = authorizeRoles('teamlead', 'hr', 'md');

export const allowTeamLead = authorizeRoles('teamlead');

// 👤 employees only
export const allowEmployeesOnly = authorizeRoles('employee');

// 👤 Anyone authenticated (same as ALL)
export const allowEveryone = authorizeRoles('all');

