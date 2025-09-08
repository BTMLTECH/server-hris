import mongoose, { Schema, Document, Types } from "mongoose";
import { LeaveEntitlements } from "./LeaveRequest";

export interface ILeaveBalance extends Document {
  user: Types.ObjectId;
  company: Types.ObjectId;
  balances: {
    annual: number;
    compassionate: number;
    maternity: number;
  };
  year: number;
}

const LeaveBalanceSchema = new Schema<ILeaveBalance>({
  user: { type: Schema.Types.ObjectId, ref: "User", required: true },
  company: { type: Schema.Types.ObjectId, ref: "Company", required: true },
  balances: {
    annual: { type: Number, default: LeaveEntitlements.annual },
    compassionate: { type: Number, default: LeaveEntitlements.compassionate },
    maternity: { type: Number, default: LeaveEntitlements.maternity },
  },

  year: { type: Number, default: new Date().getFullYear() },
});

export default mongoose.model<ILeaveBalance>(
  "LeaveBalance",
  LeaveBalanceSchema
);
