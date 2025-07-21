// import { Request, Response, NextFunction } from 'express';
// import Company from '../models/Company';
// import ErrorResponse from '../utils/ErrorResponse';
// import { AuthData, CompanyRole } from '../types/auth';
// import { TypedRequest } from '../types/typedRequest';
// import { TypedResponse } from '../types/typedResponse';
// import { logAudit } from '../utils/logAudit';
// import { asyncHandler } from '../middleware/asyncHandler';

// // Company Admin creates role folder(s) inside their company
// export const createRolesForCompany = asyncHandler(
//   async (req: TypedRequest<{}, {}, {roles: string}>, res: TypedResponse<CompanyRole>, next: NextFunction) => {
//     const companyId = req.company?.id;
//     const { roles } = req.body; // roles: string[]

//     if (!Array.isArray(roles) || roles.length === 0) {
//       return next(new ErrorResponse('Roles array is required', 400));
//     }

//     // Prevent duplicate roles in company
//     const company = await Company.findById(companyId);
//     if (!company) return next(new ErrorResponse('Company not found', 404));

//     const existingRoles = company.roles;
//     const newRoles = roles.filter((role) => !existingRoles.includes(role));

//     if (newRoles.length === 0) {
//       return next(new ErrorResponse('All roles already exist', 400));
//     }

//     company.roles.push(...newRoles);
//     await company.save();

//     await logAudit({
//           userId:companyId,
//           action: 'ROLE_CREATED', 
//           status: 'SUCCESS',
//           ip: req.ip,
//           userAgent: req.get('user-agent'),
//         });

//     res.status(201).json({
//       success: true,
//       message: 'Roles created successfully',
//       data: { roles: company.roles },
//     });
//   }
// );
