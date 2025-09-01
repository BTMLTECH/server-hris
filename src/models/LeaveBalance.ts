
import mongoose, { Schema, Document } from 'mongoose';
import { LeaveType, LeaveEntitlements } from './LeaveRequest';

export interface ILeaveBalance extends Document {
  user: mongoose.Types.ObjectId;
  balances: Record<LeaveType, number>;
  year: number;
}

const LeaveBalanceSchema = new Schema<ILeaveBalance>({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  balances: {
    annual: { type: Number, default: LeaveEntitlements.annual },
    compassionate: { type: Number, default: LeaveEntitlements.compassionate },
    maternity: { type: Number, default: LeaveEntitlements.maternity },
  },
  year: { type: Number, default: new Date().getFullYear() },
});

export default mongoose.model<ILeaveBalance>('LeaveBalance', LeaveBalanceSchema);
