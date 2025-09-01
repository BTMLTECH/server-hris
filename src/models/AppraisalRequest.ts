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
const AppraisalObjectiveSchema = new mongoose_1.Schema({
    id: { type: String, required: true },
    category: {
        type: String,
        enum: ['OBJECTIVES', 'FINANCIAL', 'CUSTOMER', 'INTERNAL_PROCESS', 'LEARNING_AND_GROWTH'],
        required: true,
    },
    name: { type: String, required: true },
    marks: { type: Number, required: true },
    kpi: { type: String, required: true },
    measurementTracker: { type: String, required: true },
    employeeScore: { type: Number, default: 0 },
    teamLeadScore: { type: Number, default: 0 },
    finalScore: { type: Number, default: 0 },
    employeeComments: { type: String, default: '' },
    teamLeadComments: { type: String, default: '' },
    evidence: { type: String, default: '' },
}, { _id: false });
const AppraisalRequestSchema = new mongoose_1.Schema({
    title: { type: String, required: true },
    user: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true },
    teamLeadId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true },
    department: { type: String, required: true },
    period: { type: String, required: true },
    dueDate: { type: Date, required: true },
    typeIdentify: { type: String, enum: ['appraisal'], required: true },
    objectives: [AppraisalObjectiveSchema],
    status: {
        type: String,
        enum: ['pending', 'sent_to_employee"', 'approved', 'rejected', 'submitted', 'needs_revision'],
        default: 'pending',
    },
    reviewLevel: {
        type: String,
        enum: ['teamlead', 'hr', 'md'],
        default: 'teamlead',
    },
    reviewTrail: [
        {
            reviewer: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' },
            role: { type: String },
            action: { type: String },
            date: { type: Date },
            note: { type: String },
            marksGiven: { type: Number },
        },
    ],
    totalScore: {
        employee: { type: Number, default: 0 },
        teamLead: { type: Number, default: 0 },
        final: { type: Number, default: 0 },
    },
    revisionReason: { type: String, default: '' },
    hrAdjustments: {
        innovation: { type: Boolean, default: false },
        commendation: { type: Boolean, default: false },
        query: { type: Boolean, default: false },
        majorError: { type: Boolean, default: false },
    },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
}, { timestamps: true });
exports.default = mongoose_1.default.model('AppraisalRequest', AppraisalRequestSchema);
