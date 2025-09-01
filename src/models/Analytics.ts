import mongoose, { Schema, Document } from 'mongoose';

// Interface for Salary Distribution by Department
export interface ISalaryByDept {
  department: string;
  avgSalary: number;
  minSalary: number;
  maxSalary: number;
  employees: number;
}

// Interface for Salary Distribution by Role
export interface ISalaryByRole {
  role: string;
  avgSalary: number;
  count: number;
  fill: string;
}

// Interface for Leave Analytics
export interface ILeaveAnalytics {
  type: string;
  used: number;
  total: number;
  fill: string;
}

// Interface for Hiring Trend
export interface IHiringTrend {
  month: string;
  hires: number;
  terminations: number;
}

// Interface for Attendance
export interface IAttendance {
  month: string;
  attendance: number;
}

// Interface for Chart Configuration
export interface IChartConfig {
  key: string;
  label: string;
  color: string;
}

// Interface for Birthday Analytics
export interface IBirthdayAnalytics {
  month: string;
  celebrants: [
    {
      staffId: string;
      firstName: string;
      lastName: string;
      dateOfBirth: Date;
      profileImage: string;
    }
  ];
}

// Interface for Key Metrics
export interface IKeyMetrics {
  employeeGrowth: {
    value: number;
    trend: string;
  };
  avgSalary: {
    value: number;
    trend: string;
  };
  leaveUtilization: {
    value: number;
    trend: string;
  };
}

// Interface for Dashboard Cards
export interface IDashboardCards {
  totalEmployees: {
    value: number;
    trend: string;
  };
  activeLeave: {
    value: number;
    trend: string;
  };
  appraisalsDue: {
    value: number;
    trend: string;
  };
  completedTasks: {
    value: number;
    trend: string;
  };
}

// Interface for Recent Activity
export interface IRecentActivity {
  message: string;
  timestamp: Date;
  type: string;
}

// Main Analytics Document Interface
export interface IAnalytics extends Document {
  company: mongoose.Types.ObjectId;
  salaryDistributionByDept: ISalaryByDept[];
  salaryDistributionByRole: ISalaryByRole[];
  leaveTypesData: ILeaveAnalytics[];
  hiringTrends: IHiringTrend[];
  attendanceData: IAttendance[];
  chartConfig: IChartConfig[];
  birthdayAnalytics: IBirthdayAnalytics[];
  keyMetrics: IKeyMetrics;
  dashboardCards: IDashboardCards;
  recentActivity: IRecentActivity[];
}

// Schemas for the nested interfaces
const SalaryByDeptSchema = new Schema<ISalaryByDept>({
  department: { type: String, required: true },
  avgSalary: { type: Number, required: true },
  minSalary: { type: Number, required: true },
  maxSalary: { type: Number, required: true },
  employees: { type: Number, required: true },
});

const SalaryByRoleSchema = new Schema<ISalaryByRole>({
  role: { type: String, required: true },
  avgSalary: { type: Number, required: true },
  count: { type: Number, required: true },
  fill: { type: String, required: true },
});

const LeaveAnalyticsSchema = new Schema<ILeaveAnalytics>({
  type: { type: String, required: true },
  used: { type: Number, required: true },
  total: { type: Number, required: true },
  fill: { type: String, required: true },
});

const HiringTrendSchema = new Schema<IHiringTrend>({
  month: { type: String, required: true },
  hires: { type: Number, required: true },
  terminations: { type: Number, required: true },
});

const AttendanceSchema = new Schema<IAttendance>({
  month: { type: String, required: true },
  attendance: { type: Number, required: true },
});

const ChartConfigSchema = new Schema<IChartConfig>({
  key: { type: String, required: true },
  label: { type: String, required: true },
  color: { type: String, required: true },
});

const BirthdayAnalyticsSchema = new Schema<IBirthdayAnalytics>({
  month: { type: String, required: true },
  celebrants: [
    {
      staffId: { type: String, required: true },
      firstName: { type: String, required: true },
      lastName: { type: String, required: true },
      dateOfBirth: { type: Date, required: true },
      profileImage: { type: String, required: false },
    },
  ],
});

const KeyMetricsSchema = new Schema<IKeyMetrics>({
  employeeGrowth: {
    value: { type: Number, required: true },
    trend: { type: String, required: true },
  },
  avgSalary: {
    value: { type: Number, required: true },
    trend: { type: String, required: true },
  },
  leaveUtilization: {
    value: { type: Number, required: true },
    trend: { type: String, required: true },
  },
});

const DashboardCardsSchema = new Schema<IDashboardCards>({
  totalEmployees: {
    value: { type: Number, required: true },
    trend: { type: String, required: true },
  },
  activeLeave: {
    value: { type: Number, required: true },
    trend: { type: String, required: true },
  },
  appraisalsDue: {
    value: { type: Number, required: true },
    trend: { type: String, required: true },
  },
  completedTasks: {
    value: { type: Number, required: true },
    trend: { type: String, required: true },
  },
});

const RecentActivitySchema = new Schema<IRecentActivity>({
  message: { type: String, required: true },
  timestamp: { type: Date, required: true },
  type: { type: String, required: true },
});

// Main Analytics Schema
const AnalyticsSchema = new Schema<IAnalytics>(
  {
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      unique: true,
    },
    salaryDistributionByDept: [SalaryByDeptSchema],
    salaryDistributionByRole: [SalaryByRoleSchema],
    leaveTypesData: [LeaveAnalyticsSchema],
    hiringTrends: [HiringTrendSchema],
    attendanceData: [AttendanceSchema],
    chartConfig: [ChartConfigSchema],
    birthdayAnalytics: [BirthdayAnalyticsSchema],
    keyMetrics: KeyMetricsSchema,
    dashboardCards: DashboardCardsSchema,
    recentActivity: [RecentActivitySchema],
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
    },
    toObject: {
      virtuals: true,
    },
  }
);

// Exports
const Analytics = mongoose.model<IAnalytics>('Analytics', AnalyticsSchema);

export default Analytics;
