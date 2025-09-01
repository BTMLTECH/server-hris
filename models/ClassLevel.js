"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importStar(require("mongoose"));
const ClassLevelSchema = new mongoose_1.Schema({
    company: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Company', required: true },
    year: { type: Number, required: true },
    level: { type: Number, required: true },
    payGrade: { type: String, required: true },
    basicSalary: { type: Number, required: true },
    housingAllowance: { type: Number, default: 0 },
    transportAllowance: { type: Number, default: 0 },
    lasgAllowance: { type: Number, default: 0 },
    twentyFourHoursAllowance: { type: Number, default: 0 },
    healthAllowance: { type: Number, default: 0 },
    otherAllowance: { type: Number, default: 0 },
    totalAllowances: { type: Number, default: 0 },
    grossSalary: { type: Number, default: 0 },
}, { timestamps: true });
function calculateSalaries(doc) {
    doc.totalAllowances =
        (doc.housingAllowance || 0) +
            (doc.transportAllowance || 0) +
            (doc.lasgAllowance || 0) +
            (doc.twentyFourHoursAllowance || 0) +
            (doc.healthAllowance || 0) +
            (doc.otherAllowance || 0);
    doc.grossSalary = (doc.basicSalary || 0) + (doc.totalAllowances || 0);
}
// Runs for .save()
ClassLevelSchema.pre('save', function (next) {
    calculateSalaries(this);
    next();
});
// Runs for insertMany()
ClassLevelSchema.pre('insertMany', function (next, docs) {
    docs.forEach(doc => calculateSalaries(doc));
    next();
});
exports.default = mongoose_1.default.model('ClassLevel', ClassLevelSchema);
