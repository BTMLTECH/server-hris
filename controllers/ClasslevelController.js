"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.bulkDeleteClassLevelsByYear = exports.deleteClassLevel = exports.updateClassLevel = exports.getAllClassLevels = exports.createClassLevel = exports.bulkCreateClassLevels = exports.calculateClass = void 0;
const asyncHandler_1 = require("../middleware/asyncHandler");
const ErrorResponse_1 = __importDefault(require("../utils/ErrorResponse"));
const ClassLevel_1 = __importDefault(require("../models/ClassLevel"));
const payrollCalculator_1 = require("../utils/payrollCalculator");
const excelParser_1 = require("../utils/excelParser");
exports.calculateClass = (0, asyncHandler_1.asyncHandler)(async (req, res, next) => {
    try {
        const { band } = req.body;
        if (!band) {
            return next(new ErrorResponse_1.default("band is required", 400));
        }
        const basicSalary = band * 0.55;
        const housingAllowance = band * 0.25;
        const transportAllowance = band * 0.20;
        const totalAllowances = housingAllowance + transportAllowance;
        const payrollResult = (0, payrollCalculator_1.calculatePayroll)({
            basicSalary,
            totalAllowances
        });
        const payload = {
            basicSalary,
            housingAllowance,
            transportAllowance,
            totalAllowances,
            payrollResult
        };
        // return response
        return res.status(200).json({
            success: true,
            data: payload,
        });
    }
    catch (error) {
        return next(error);
    }
});
exports.bulkCreateClassLevels = (0, asyncHandler_1.asyncHandler)(async (req, res, next) => {
    const companyId = req.company?._id;
    if (!companyId) {
        return next(new ErrorResponse_1.default("Company ID is required", 400));
    }
    let classLevels = [];
    // Accept file or JSON body
    if (req.file) {
        classLevels = (0, excelParser_1.parseExcelClassLevels)(req.file.buffer);
    }
    else if (Array.isArray(req.body)) {
        classLevels = req.body;
    }
    else {
        return next(new ErrorResponse_1.default("Invalid input. Expecting an array or an Excel file.", 400));
    }
    const created = [];
    const errors = [];
    const requiredFields = ["year", "level", "payGrade", "grossSalary"];
    for (const cl of classLevels) {
        // 🔹 Validate required fields
        let missingField = false;
        for (const field of requiredFields) {
            if (cl[field] === undefined || cl[field] === null) {
                errors.push(`Missing required field: ${field} (PayGrade: ${cl.payGrade || "UNKNOWN"})`);
                missingField = true;
            }
        }
        if (missingField)
            continue;
        // 🔹 Check if class level already exists
        const existing = await ClassLevel_1.default.findOne({
            year: cl.year,
            level: cl.level,
            payGrade: cl.payGrade,
            company: companyId,
        });
        if (existing) {
            errors.push(`Duplicate: ${cl.year}-${cl.level}-${cl.payGrade} already exists`);
            continue;
        }
        // 🔹 Calculate breakdown
        const { basicSalary, housingAllowance, transportAllowance } = (0, excelParser_1.recalcBreakdown)(cl.grossSalary);
        // 🔹 Create new record
        const newClassLevel = new ClassLevel_1.default({
            year: cl.year,
            level: cl.level,
            payGrade: cl.payGrade,
            band: `${cl.year} ${cl.payGrade}`,
            grossSalary: cl.grossSalary,
            basicSalary,
            housingAllowance,
            transportAllowance,
            company: companyId,
        });
        await newClassLevel.save();
        created.push(`${cl.year}-${cl.level}-${cl.payGrade}`);
    }
    res.status(200).json({
        success: true,
        message: "Class levels processed successfully.",
        data: {
            created,
            errors,
        },
    });
});
exports.createClassLevel = (0, asyncHandler_1.asyncHandler)(async (req, res, next) => {
    const companyId = req.company?._id;
    if (!companyId) {
        return next(new ErrorResponse_1.default('Company ID is required', 400));
    }
    const requiredFields = [
        'year',
        'level',
        'payGrade',
        'basicSalary',
        'housingAllowance',
        'transportAllowance'
    ];
    for (const field of requiredFields) {
        if (req.body[field] === undefined || req.body[field] === null) {
            return next(new ErrorResponse_1.default(`Missing required field: ${field}`, 400));
        }
    }
    const exists = await ClassLevel_1.default.findOne({
        year: req.body.year,
        level: req.body.level,
        payGrade: req.body.payGrade,
        company: companyId
    });
    if (exists) {
        return next(new ErrorResponse_1.default('ClassLevel already exists for this year and pay grade', 400));
    }
    const created = await ClassLevel_1.default.create({
        ...req.body,
        company: companyId
    });
    return res.status(201).json({
        success: true,
        message: 'ClassLevel created successfully',
        data: created
    });
});
exports.getAllClassLevels = (0, asyncHandler_1.asyncHandler)(async (req, res, next) => {
    try {
        const companyId = req.company?._id;
        if (!companyId) {
            return next(new ErrorResponse_1.default('Company ID is required', 400));
        }
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 30;
        const skip = (page - 1) * limit;
        const query = { company: companyId };
        if (req.query.year) {
            query.year = parseInt(req.query.year);
        }
        const [classLevels, total] = await Promise.all([
            ClassLevel_1.default.find(query)
                .sort({ level: 1, payGrade: 1 })
                .skip(skip)
                .limit(limit),
            ClassLevel_1.default.countDocuments(query)
        ]);
        const pages = Math.ceil(total / limit);
        res.status(200).json({
            success: true,
            data: {
                data: classLevels,
                pagination: { total, page, limit, pages },
                count: classLevels.length
            }
        });
    }
    catch (err) {
        next(new ErrorResponse_1.default(err.message, 500));
    }
});
exports.updateClassLevel = (0, asyncHandler_1.asyncHandler)(async (req, res, next) => {
    const companyId = req.company?._id;
    if (!companyId) {
        return next(new ErrorResponse_1.default('Company ID is required', 400));
    }
    const { id } = req.params;
    const classLevel = await ClassLevel_1.default.findOne({ _id: id, company: companyId });
    if (!classLevel) {
        return next(new ErrorResponse_1.default('ClassLevel not found', 404));
    }
    const allowedUpdates = [
        'level',
        'payGrade',
        'basicSalary',
        'housingAllowance',
        'transportAllowance',
        'lasgAllowance',
        'twentyFourHoursAllowance',
        'healthAllowance',
        'otherAllowance'
    ];
    const updates = {};
    for (const key of allowedUpdates) {
        if (req.body[key] !== undefined) {
            updates[key] = req.body[key];
        }
    }
    const updated = await ClassLevel_1.default.findByIdAndUpdate(id, { $set: updates }, { new: true, runValidators: true });
    return res.status(200).json({
        success: true,
        message: 'ClassLevel updated successfully',
        data: updated
    });
});
exports.deleteClassLevel = (0, asyncHandler_1.asyncHandler)(async (req, res, next) => {
    const companyId = req.company?._id;
    if (!companyId) {
        return next(new ErrorResponse_1.default('Company ID is required', 400));
    }
    const { id } = req.params;
    const deleted = await ClassLevel_1.default.findOneAndDelete({
        _id: id,
        company: companyId
    });
    if (!deleted) {
        return next(new ErrorResponse_1.default('ClassLevel not found', 404));
    }
    return res.status(200).json({
        success: true,
        message: 'ClassLevel deleted successfully'
    });
});
exports.bulkDeleteClassLevelsByYear = (0, asyncHandler_1.asyncHandler)(async (req, res, next) => {
    const companyId = req.company?._id;
    const { year } = req.body;
    if (!companyId) {
        return next(new ErrorResponse_1.default("Company ID is required", 400));
    }
    if (!year) {
        return next(new ErrorResponse_1.default("Year is required", 400));
    }
    const result = await ClassLevel_1.default.deleteMany({
        year,
        company: companyId,
    });
    res.status(200).json({
        success: true,
        message: `Deleted ${result.deletedCount} class level(s) for year ${year}`,
        data: { deleted: result.deletedCount },
    });
});
