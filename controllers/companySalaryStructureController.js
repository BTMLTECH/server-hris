"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCompanySalary = exports.updateCompanySalaryStructure = exports.createOrUpdateCompanySalary = void 0;
const asyncHandler_1 = require("../middleware/asyncHandler");
const CompanySalaryStructure_1 = __importDefault(require("../models/CompanySalaryStructure"));
const ErrorResponse_1 = __importDefault(require("../utils/ErrorResponse"));
exports.createOrUpdateCompanySalary = (0, asyncHandler_1.asyncHandler)(async (req, res, next) => {
    const companyId = req.company?.id;
    const { basicSalary, allowances, deductions, taxPercentage } = req.body;
    if (!basicSalary || !allowances || !deductions || taxPercentage === undefined) {
        return next(new ErrorResponse_1.default('All salary structure fields are required.', 400));
    }
    let structure = await CompanySalaryStructure_1.default.findOne({ company: companyId });
    if (structure) {
        structure.basicSalary = basicSalary;
        structure.allowances = allowances;
        structure.deductions = deductions;
        structure.taxPercentage = taxPercentage;
        await structure.save();
    }
    else {
        structure = await CompanySalaryStructure_1.default.create({
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
});
// Get Company Salary Structure
exports.updateCompanySalaryStructure = (0, asyncHandler_1.asyncHandler)(async (req, res, next) => {
    const companyId = req.company?.id;
    const { basicSalary, allowances, deductions, taxPercentage } = req.body;
    // Validate required fields
    if (basicSalary === undefined ||
        allowances === undefined ||
        deductions === undefined ||
        taxPercentage === undefined) {
        return next(new ErrorResponse_1.default('All salary structure fields are required.', 400));
    }
    let structure = await CompanySalaryStructure_1.default.findOne({ company: companyId });
    if (structure) {
        structure.basicSalary = basicSalary;
        structure.allowances = allowances;
        structure.deductions = deductions;
        structure.taxPercentage = taxPercentage;
        await structure.save();
    }
    else {
        structure = await CompanySalaryStructure_1.default.create({
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
});
exports.getCompanySalary = (0, asyncHandler_1.asyncHandler)(async (req, res, next) => {
    const companyId = req.company?.id;
    const structure = await CompanySalaryStructure_1.default.findOne({ company: companyId });
    if (!structure) {
        return next(new ErrorResponse_1.default('No salary structure found for this company.', 404));
    }
    res.status(200).json({
        success: true,
        data: {
            data: structure
        },
    });
});
