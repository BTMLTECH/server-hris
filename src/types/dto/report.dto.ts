
export interface GenerateReportDTO {
  reportType: 'employee_summary' | 'department_analysis' | 'attendance_report' | 'payroll_summary' | 'performance_metrics';
  dateRange: 'daily' | 'last_7_days' | 'last_30_days' | 'last_quarter' | 'last_year' | 'custom';
  startDate?: Date;
  endDate?: Date;
  department?: string; 
  exportFormat?: 'pdf' | 'excel' | 'csv';
  generatedBy: string; 
  company: string; 
}
