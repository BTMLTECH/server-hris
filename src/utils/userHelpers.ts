// src/helpers/userHelpers.ts
import User from '../models/user.model';
import { Types } from 'mongoose';

export const getCompanyScopedUsers = async (companyId: Types.ObjectId) => {
  return await User.find({ company: companyId }).select('-password');
};
