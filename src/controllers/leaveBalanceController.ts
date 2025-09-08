// controllers/leaveBalance.controller.ts
import { NextFunction } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import LeaveBalance, { ILeaveBalance } from "../models/LeaveBalance";
import { TypedRequest } from "../types/typedRequest";
import { TypedResponse } from "../types/typedResponse";
import ErrorResponse from "../utils/ErrorResponse";
import {
  CreateLeaveBalanceBody,
  SingleLeaveBalanceResponse,
  PaginatedLeaveBalanceResponse,
  UpdateLeaveBalanceBody,
  DeleteLeaveBalanceResponse,
} from "../types/leaveType";
import { logAudit } from "../utils/logAudit";
import { LeaveEntitlements } from "../models/LeaveRequest";



export const createLeaveBalance = asyncHandler(
  async (
    req: TypedRequest<{}, {}, CreateLeaveBalanceBody>,
    res: TypedResponse<SingleLeaveBalanceResponse>,
    next: NextFunction
  ) => {
    const companyId = req.company?._id;
    const userId = req.user?._id;
    if (!companyId) return next(new ErrorResponse("Invalid company context", 400));

    const { user, balances, year } = req.body;
    if (!user) return next(new ErrorResponse("User is required", 400));

    const y = year ?? new Date().getFullYear();

    // ✅ Prevent duplicates
    const existing = await LeaveBalance.findOne({ user, company: companyId, year: y });
    if (existing) {
      return next(
        new ErrorResponse("Leave balance already exists for this user and year", 400)
      );
    }

    // ✅ Validate balances (if provided), otherwise use entitlements
    const validatedBalances: Record<keyof typeof LeaveEntitlements, number> = {
      annual: balances?.annual ?? LeaveEntitlements.annual,
      compassionate: balances?.compassionate ?? LeaveEntitlements.compassionate,
      maternity: balances?.maternity ?? LeaveEntitlements.maternity,
    };

    // 🚫 Ensure they’re within allowed range
    for (const type of Object.keys(validatedBalances) as (keyof typeof LeaveEntitlements)[]) {
      const val = validatedBalances[type];
      const max = LeaveEntitlements[type];
      if (val < 0) {
        return next(new ErrorResponse(`${type} balance cannot be negative`, 400));
      }
      if (val > max) {
        return next(
          new ErrorResponse(`${type} balance cannot exceed ${max}`, 400)
        );
      }
    }

    // ✅ Create record
    const balance = await LeaveBalance.create({
      user,
      company: companyId,
      year: y,
      balances: validatedBalances,
    });

    // 📝 Audit log
    await logAudit({
      userId,
      action: "CREATE_LEAVE_BALANCE",
      status: "SUCCESS",
      ip: req.ip,
      userAgent: req.get("user-agent"),
      details: { leaveBalanceId: balance._id, user, year: y, balances: validatedBalances },
    });

    res.status(201).json({
      success: true,
      message: "Leave balance created",
    });
  }
);


export const updateLeaveBalance = asyncHandler(
  async (
    req: TypedRequest<{ id?: string }, {}, UpdateLeaveBalanceBody>,
    res: TypedResponse<SingleLeaveBalanceResponse>,
    next: NextFunction
  ) => {
    const companyId = req.company?._id;
    const userId = req.user?._id;

    if (!companyId) {
      return next(new ErrorResponse("Invalid company context", 400));
    }

    const { id } = req.params;
    const { leaveType, balance, year } = req.body;

    if (!id) return next(new ErrorResponse("Leave balance ID is required", 400));
    if (!leaveType || typeof balance !== "number") {
      return next(new ErrorResponse("Leave type and balance delta are required", 400));
    }

    // Find document first
    const leaveBalance = await LeaveBalance.findOne({ _id: id, company: companyId });
    if (!leaveBalance) {
      return next(new ErrorResponse("Leave balance not found", 404));
    }

    // Current value
    const current = leaveBalance.balances[leaveType] ?? 0;

    // New value = current + delta
    let newValue = current + balance;

    // 🚫 Cannot go below 0
    if (newValue < 0) {
      return next(new ErrorResponse(`${leaveType} balance cannot go below 0`, 400));
    }

    // 🚫 Cannot exceed entitlement
    const maxAllowed = LeaveEntitlements[leaveType];
    if (newValue > maxAllowed) {
      return next(
        new ErrorResponse(`${leaveType} balance cannot exceed ${maxAllowed}`, 400)
      );
    }

    // Apply update
    leaveBalance.balances[leaveType] = newValue;
    if (typeof year === "number") {
      leaveBalance.year = year;
    }

    const updatedBalance = await leaveBalance.save();

    // 📝 Audit log
    await logAudit({
      userId,
      action: "UPDATE_LEAVE_BALANCE",
      status: "SUCCESS",
      ip: req.ip,
      userAgent: req.get("user-agent"),
      details: {
        leaveBalanceId: updatedBalance._id,
        leaveType,
        delta: balance,
        final: newValue,
      },
    });

    res.status(200).json({
      success: true,
      message: "Leave balance updated",
    });
  }
);


