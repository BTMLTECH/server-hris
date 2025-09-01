// models/Report.ts
import mongoose, { Document, Schema } from 'mongoose';
import { IUser } from './user.model';


export interface IReport extends Document {
  reportType: 'employee_summary' | 'department_analysis' | 'attendance_report' | 'payroll_summary' | 'performance_metrics';
  dateRange: 'daily' |'last_7_days' | 'last_30_days' | 'last_quarter' | 'last_year' | 'custom';
  startDate?: Date
  endDate?: Date;   
  department?: IUser['department'] | 'all';
  generatedBy: mongoose.Types.ObjectId;
  company: mongoose.Types.ObjectId;
  exportFormat?: 'pdf' | 'excel' | 'csv';
  createdAt: Date;
}

const ReportSchema = new Schema<IReport>({
  reportType: {
    type: String,
    enum: ['employee_summary', 'department_analysis', 'attendance_report', 'payroll_summary', 'performance_metrics'],
    required: true
  },
  dateRange: {
    type: String,
       enum: ['daily', 'last_7_days', 'last_30_days', 'last_quarter', 'last_year', 'custom'],
    required: true
  },
  startDate: { type: Date },
  endDate: { type: Date },
  department: {
    type: String,
    enum: [
      'all',
      'it',
      'account',
      'hr',
      'channel',
      'retail',
      'operation',
      'corporate',
      'marketing',
      'md',
      'teamlead',
      'employee',
      'sou',
      'admin',
      'rgogh',
      'roaghi'
    ],
    default: 'all'
  },
  generatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  company: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
  exportFormat: { type: String, enum: ['pdf', 'excel', 'csv'], default: 'pdf' },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model<IReport>('Report', ReportSchema);
