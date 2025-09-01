"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VALID_DEPARTMENTS = exports.getCompanyScopedUsers = void 0;
// src/helpers/userHelpers.ts
const user_model_1 = __importDefault(require("../models/user.model"));
const getCompanyScopedUsers = async (companyId) => {
    return await user_model_1.default.find({ company: companyId }).select('-password');
};
exports.getCompanyScopedUsers = getCompanyScopedUsers;
exports.VALID_DEPARTMENTS = [
    'it', 'account', 'hr', 'channel', 'retail', 'operation', 'operationsbu',
    'corporate', 'marketing', 'md', 'teamlead', 'employee',
    'admin', 'rgogh', 'roaghi'
];
