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
exports.Training = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const FeedbackSchema = new mongoose_1.Schema({
    user: { type: mongoose_1.Schema.Types.ObjectId, ref: "User", required: true },
    department: { type: String, required: true },
    answers: [
        {
            question: { type: String, required: true },
            response: {
                type: String,
                enum: ["AGREE", "STRONGLY AGREE", "DISAGREE", "AVERAGE", "EXCELLENT"],
                required: true,
            },
        },
    ],
    additionalComments: String,
    submittedAt: Date,
    status: {
        type: String,
        enum: ["pending", "submitted"],
        default: "pending",
    },
}, { _id: false });
const ParticipantSchema = new mongoose_1.Schema({
    id: { type: mongoose_1.Schema.Types.ObjectId, ref: "User" },
    firstName: String,
    middleName: String,
    lastName: String,
    email: String,
    department: String,
    position: String,
    role: String,
    staffId: String,
    status: {
        type: String,
        enum: ["pending", "submitted"],
        default: "pending",
    },
}, { _id: false });
const TrainingSchema = new mongoose_1.Schema({
    title: { type: String, required: true },
    date: { type: Date, required: true },
    department: { type: String, required: true },
    trainer: { type: String, required: true },
    noOfTrainees: { type: Number, required: true },
    company: { type: mongoose_1.Schema.Types.ObjectId, ref: "Company", required: true },
    participantEmails: [{ type: String, required: true }],
    participants: [ParticipantSchema],
    questions: [{ type: String, required: true }],
    feedbacks: [FeedbackSchema],
    status: {
        type: String,
        enum: ["pending", "submitted"],
        default: "pending",
    },
    createdAt: { type: Date, default: Date.now },
});
exports.Training = mongoose_1.default.model("Training", TrainingSchema);
