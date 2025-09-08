import { IAttendance } from "../models/Attendance";

// ATTENDANCE 
export interface BiometryCheckInResponse {
  data: IAttendance;
}


export interface BiometryCheckInDto {
  biometryId: string;
}

export interface ManualCheckInDto {
  shift?: 'day' | 'night';
}



// Update response interface to match actual structure
export interface AttendanceHistoryResponse {
  count: number;
  page?: number,
  pageSize?: number,
  data: IAttendance[];
}

// types/attendance.ts (or wherever you keep shared types)
export interface AttendanceHistoryQuery {
  startDate?: string;
  endDate?: string;
  department?: string;
  shift?: "day" | "night";
  company?: string;
  page?: string;
  limit?: string;
}


interface AdminAttendanceQuery {
  startDate?: string;
  endDate?: string;
  department?: string;
   shift?: "day" | "night";

  company?: string;
  page?: string;
  limit?: string;
}

// dtos/AdminAttendanceReportQuery.dto.ts

export interface AdminAttendanceReportQuery {
  startDate?: string;   // Dates come as strings from req.query
  endDate?: string;
  department?: string;
  shift?: 'day' | 'night';
  company?: string;     // Assuming company ID as string
  page?: number,
  limit?: number,
}

// dtos/EmployeeAttendanceStats.dto.ts

interface EmployeeAttendanceStats {
  totalDays: number;
  lateDays: number;
  presentDays: number;
  totalHoursWorked: number;
  latePercentage: number;
}

export interface EmployeeAttendanceStatsResponse {
  data: EmployeeAttendanceStats;
}

export interface CompanyAttendanceSummaryQuery {
  companyId?: string;
}

// dtos/CompanyAttendanceSummary.dto.ts
export interface CompanyAttendanceSummary {
  totalEmployees: number;
  dayShift: number;
  nightShift: number;
  attendanceRate: number;
}
export interface CompanyAttendanceSummaryResponse {
  data: CompanyAttendanceSummary;
}

// dtos/AttendanceFilterQuery.dto.ts
export interface AttendanceFilterQuery {
  startDate?: string;
  endDate?: string;
  department?: string;
  shift?: 'day' | 'night';
  company?: string;
}


