
import { NextFunction } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import CompanySalaryStructure from '../models/CompanySalaryStructure';
import { TypedRequest } from '../types/typedRequest';
import { TypedResponse } from '../types/typedResponse';
import ErrorResponse from '../utils/ErrorResponse';
import { CreateCompanySalaryDTO, CreateCompanySalaryResponse } from '../types/companyStructureTypes';
import { ICompany } from '../models/Company';

// Create or Update Company Salary Structure
export const createOrUpdateCompanySalary = asyncHandler(
  async (
    req: TypedRequest<{}, {}, CreateCompanySalaryDTO>,
    res: TypedResponse<CreateCompanySalaryResponse>,
    next: NextFunction
  ) => {
     const companyId  = req.company?.id as ICompany;
    const { basicSalary, allowances, deductions, taxPercentage } = req.body;

    if (!basicSalary || !allowances || !deductions || taxPercentage === undefined) {
      return next(new ErrorResponse('All salary structure fields are required.', 400));
    }

    let structure = await CompanySalaryStructure.findOne({ company: companyId });

    if (structure) {
      structure.basicSalary = basicSalary;
      structure.allowances = allowances;
      structure.deductions = deductions;
      structure.taxPercentage = taxPercentage;
      await structure.save();
    } else {
      structure = await CompanySalaryStructure.create({
        company: companyId,
        basicSalary,
        allowances,
        deductions,
        taxPercentage,
      });
    }

    res.status(200).json({
      success: true,
      message: 'Company salary structure saved successfully.',
      data: {
        data: structure
      },
    });
  }
);

// Get Company Salary Structure
export const updateCompanySalaryStructure = asyncHandler(
  async (
    req: TypedRequest<{}, {}, CreateCompanySalaryDTO>,
    res: TypedResponse<CreateCompanySalaryResponse>,
    next: NextFunction
  ) => {
    const companyId  = req.company?.id as ICompany;
    const { basicSalary, allowances, deductions, taxPercentage } = req.body;

    // Validate required fields
    if (
      basicSalary === undefined ||
      allowances === undefined ||
      deductions === undefined ||
      taxPercentage === undefined
    ) {
      return next(
        new ErrorResponse('All salary structure fields are required.', 400)
      );
    }

    let structure = await CompanySalaryStructure.findOne({ company: companyId });

    if (structure) {
      structure.basicSalary = basicSalary;
      structure.allowances = allowances;
      structure.deductions = deductions;
      structure.taxPercentage = taxPercentage;
      await structure.save();
    } else {
      structure = await CompanySalaryStructure.create({
        company: companyId,
        basicSalary,
        allowances,
        deductions,
        taxPercentage,
      });
    }

    res.status(200).json({
      success: true,
      message: 'Company salary structure updated successfully.',
      data: {
        data: structure
      },
    });
  }
);
export const getCompanySalary = asyncHandler(
  async (
    req: TypedRequest,
    res: TypedResponse<CreateCompanySalaryResponse>,
    next: NextFunction
  ) => {
    const companyId  = req.company?.id;

    const structure = await CompanySalaryStructure.findOne({ company: companyId });

    if (!structure) {
      return next(new ErrorResponse('No salary structure found for this company.', 404));
    }

    res.status(200).json({
      success: true,
      data: {
        data: structure
      },
    });
  }
);
