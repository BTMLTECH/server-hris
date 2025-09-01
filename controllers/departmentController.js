"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateDepartment = exports.getAllDepartments = exports.bulkCreateDepartments = void 0;
const department_model_1 = __importDefault(require("../models/department.model"));
const asyncHandler_1 = require("../middleware/asyncHandler");
const ErrorResponse_1 = __importDefault(require("../utils/ErrorResponse"));
exports.bulkCreateDepartments = (0, asyncHandler_1.asyncHandler)(async (req, res, next) => {
    const companyId = req.company?._id;
    const { departments } = req.body;
    if (!companyId) {
        return next(new ErrorResponse_1.default('Company ID is required', 400));
    }
    if (!Array.isArray(departments) || departments.length === 0) {
        return next(new ErrorResponse_1.default('Please provide an array of departments', 400));
    }
    for (const dept of departments) {
        if (!dept.name) {
            return next(new ErrorResponse_1.default('Each department must have a name', 400));
        }
    }
    const names = departments.map(d => d.name.trim());
    const existing = await department_model_1.default.find({ name: { $in: names }, company: companyId });
    const existingNames = existing.map(e => e.name);
    const filtered = departments
        .filter(dept => !existingNames.includes(dept.name.trim()))
        .map(dept => ({ ...dept, company: companyId })); // ✅ Attach companyId here
    if (filtered.length === 0) {
        return next(new ErrorResponse_1.default('All provided departments already exist', 400));
    }
    const inserted = await department_model_1.default.insertMany(filtered);
    return res.status(201).json({
        success: true,
        message: 'Departments created successfully',
        data: inserted
    });
});
exports.getAllDepartments = (0, asyncHandler_1.asyncHandler)(async (req, res, next) => {
    try {
        const companyId = req.company?._id;
        if (!companyId) {
            return next(new ErrorResponse_1.default('Invalid company context', 400));
        }
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;
        const companyQuery = [
            { company: companyId },
            { company: companyId.toString() }
        ];
        const [departments, total] = await Promise.all([
            department_model_1.default.find({ $or: companyQuery })
                .sort({ name: 1 })
                .skip(skip)
                .limit(limit),
            department_model_1.default.countDocuments({ $or: companyQuery })
        ]);
        const pages = Math.ceil(total / limit);
        if (departments.length === 0) {
        }
        res.status(200).json({
            success: true,
            data: {
                data: departments,
                pagination: { total, page, limit, pages },
                count: departments.length
            }
        });
    }
    catch (err) {
        next(new ErrorResponse_1.default(err.message, 500));
    }
});
exports.updateDepartment = (0, asyncHandler_1.asyncHandler)(async (req, res, next) => {
    const { id } = req.params;
    const companyId = req.company?._id;
    const department = await department_model_1.default.findOne({ _id: id, company: companyId });
    if (!department) {
        return next(new ErrorResponse_1.default('Department not found for this company', 404));
    }
    const allowedUpdates = ['name', 'supervisor', 'sopDocument'];
    const updates = {};
    for (const key of allowedUpdates) {
        if (req.body[key] !== undefined) {
            updates[key] = req.body[key];
        }
    }
    const updated = await department_model_1.default.findOneAndUpdate({ _id: id, company: companyId }, { $set: updates }, { new: true, runValidators: true });
    return res.status(200).json({
        success: true,
        message: 'Department updated successfully',
        data: updated
    });
});
