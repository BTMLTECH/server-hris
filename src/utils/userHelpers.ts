// src/helpers/userHelpers.ts
import User, { IUser } from '../models/user.model';
import { Types } from 'mongoose';

export const getCompanyScopedUsers = async (companyId: Types.ObjectId) => {
  return await User.find({ company: companyId }).select('-password');
};




export const VALID_DEPARTMENTS: IUser["department"][] = [
  "it",
  "account",
  "hr",
  "channel",
  "retail",
  "operation",
  "operationsbu",
  "corporate",
  "marketing",
  "md",
  "teamlead",
  "employee",
  "admin",
  "rgogh",
  "roaghi",
];
