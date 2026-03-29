import { Response } from 'express';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import axios from 'axios';
import { ChartJSNodeCanvas } from 'chartjs-node-canvas';
import { ChartConfiguration } from 'chart.js';
import { IUser } from '../models/user.model';
import { IAttendance } from '../models/Attendance';
import { IPayroll } from '../models/PayrollNew';
import path from 'path';
import { ICompany } from '../models/Company';

export const formatCurrency = (amount?: number | null): string => {
  if (!amount || isNaN(amount)) return '₦0.00';
  return `₦${amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

export const capitalizeWords = (str: string | undefined | null): string => {
  if (!str) return 'N/A';
  return str
    .toLowerCase()
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

// ✅ Convert month number to name
export const getMonthName = (monthNumber: number): string => {
  const date = new Date(2000, monthNumber - 1);
  return date.toLocaleString('default', { month: 'long' });
};
export class ExportService {
  private static chartJSNodeCanvas = new ChartJSNodeCanvas({ width: 900, height: 500 });

  // ------------------- CHART GENERATION --------------------
  private static async generateChartImage(
    type: 'bar' | 'pie',
    labels: string[],
    data: number[],
    title: string,
  ): Promise<Buffer> {
    const configuration: ChartConfiguration<typeof type> = {
      type,
      data: {
        labels,
        datasets: [
          {
            label: title,
            data,
            backgroundColor: [
              '#4CAF50',
              '#2196F3',
              '#FFC107',
              '#FF5722',
              '#9C27B0',
              '#E91E63',
              '#00BCD4',
              '#8BC34A',
              '#CDDC39',
            ],
          },
        ],
      },
      options: {
        responsive: false,
        plugins: {
          legend: { position: 'bottom' as const },
          title: {
            display: true,
            text: title,
            font: { size: 18 },
          },
        },
      },
    };
    return ExportService.chartJSNodeCanvas.renderToBuffer(configuration);
  }

  private static async getCharts(summary: any) {
    // Employee Summary charts
    if (
      summary.reportType === 'employee_summary' ||
      (!summary.reportType && summary.totalEmployees !== undefined)
    ) {
      const barChart = await this.generateChartImage(
        'bar',
        ['Total', 'New Hires', 'Exited'],
        [summary.totalEmployees, summary.newHires, summary.exitedEmployees],
        'Employee Overview',
      );
      const pieChart = await this.generateChartImage(
        'pie',
        ['Average Salary', 'Highest Salary', 'Lowest Salary'],
        [summary.avgSalary, summary.highestSalary, summary.lowestSalary],
        'Salary Distribution',
      );
      return { barChart, pieChart };
    }

    // Department Analysis charts
    if (summary.reportType === 'department_analysis' && Array.isArray(summary.data)) {
      const deptLabels = summary.data.map((d: { department: string }) => d.department);
      const deptCounts = summary.data.map((d: { totalEmployees: number }) => d.totalEmployees);
      const deptAvgSalaries = summary.data.map((d: { avgSalary: number }) => d.avgSalary);

      const barChart = await this.generateChartImage(
        'bar',
        deptLabels,
        deptCounts,
        'Employees per Department',
      );
      const pieChart = await this.generateChartImage(
        'pie',
        deptLabels,
        deptAvgSalaries,
        'Average Salary per Department',
      );
      return { barChart, pieChart };
    }

    return { barChart: null, pieChart: null };
  }

  // ------------------- PDF EXPORT --------------------
  // static async  exportPDF(
  //   summary: any,
  //   employees: IUser[],
  //   companyData: any,
  //   res: Response,
  //   filename: string,
  // ) {
  //   res.setHeader('Content-Type', 'application/pdf');
  //   res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  //   const doc = new PDFDocument({ margin: 30 });

  //   const fontPath = path.resolve(__dirname, '../assets/fonts/Roboto-Regular.ttf');
  //   doc.registerFont('Main', fontPath);
  //   doc.font('Main');

  //   doc.pipe(res);

  //   // Company logo / name
  //   if (companyData?.branding?.logoUrl) {
  //     try {
  //       const logoResp = await axios.get(companyData.branding.logoUrl, {
  //         responseType: 'arraybuffer',
  //       });
  //       doc.image(Buffer.from(logoResp.data, 'binary'), { width: 100, align: 'center' });
  //     } catch {
  //       doc.fontSize(18).text(companyData?.name || '', { align: 'center' });
  //     }
  //   } else {
  //     doc.fontSize(18).text(companyData?.name || '', { align: 'center' });
  //   }

  //   doc.moveDown(2);
  //   doc
  //     .fontSize(22)
  //     .text(
  //       summary.reportType === 'department_analysis'
  //         ? 'Department Analysis Report'
  //         : 'Employment Summary Report',
  //       { align: 'center', underline: true },
  //     );
  //   doc.moveDown(1);

  //   // Summary table
  //   if (summary.reportType === 'department_analysis') {
  //     doc.fontSize(14).text('Department Data:', { underline: true });
  //     summary.data.forEach((dept: any) => {
  //       doc
  //         .fontSize(12)
  //         .text(
  //           `${dept.department} - Employees: ${dept.totalEmployees}, Avg Salary: ${dept.avgSalary.toFixed(
  //             2,
  //           )}`,
  //         );
  //     });
  //   } else {
  //     doc.fontSize(14).text('Summary:', { underline: true });
  //     Object.entries(summary).forEach(([key, value]) => {
  //       if (key !== 'reportType') doc.fontSize(12).text(`${key}: ${value}`);
  //     });
  //   }

  //   // Charts
  //   const { barChart, pieChart } = await this.getCharts(summary);
  //   if (barChart)
  //     doc.addPage().image(barChart, { fit: [700, 400], align: 'center', valign: 'center' });
  //   if (pieChart)
  //     doc.addPage().image(pieChart, { fit: [700, 400], align: 'center', valign: 'center' });

  //   // Employee list (extended)
  //   if (summary.reportType !== 'department_analysis') {
  //     doc.addPage();
  //     doc.fontSize(14).text('Employee List:', { underline: true });

  //     const headers = [
  //       'Staff ID',
  //       'Name',
  //       'Email',
  //       'Dept',
  //       'Position',
  //       'Branch',
  //       'Level',
  //       'Mobile',
  //       'DOB',
  //       'Employment Date',
  //       'Basic Pay',
  //       'Allowances',
  //       'Bank',
  //     ];
  //     const xPositions = [30, 90, 220, 360, 420, 480, 530, 580, 630, 700, 780, 840, 900];
  //     const tableTop = doc.y + 15;
  //     doc.fontSize(8);
  //     headers.forEach((h, i) => doc.text(h, xPositions[i], tableTop));

  //     let y = tableTop + 15;
  //     employees.forEach((emp) => {
  //       const fullName = `${emp.title || ''} ${emp.firstName} ${emp.middleName || ''} ${
  //         emp.lastName
  //       }`;
  //       doc.text(emp.staffId, xPositions[0], y);
  //       doc.text(fullName.trim(), xPositions[1], y);
  //       doc.text(emp.email, xPositions[2], y);
  //       doc.text(emp.department, xPositions[3], y);
  //       doc.text(emp.position || '', xPositions[4], y);
  //       doc.text(emp.officeBranch || '', xPositions[5], y);
  //       doc.text(emp.level || '', xPositions[6], y);
  //       doc.text(emp.mobile || '', xPositions[7], y);
  //       doc.text(
  //         emp.dateOfBirth ? new Date(emp.dateOfBirth).toLocaleDateString() : '',
  //         xPositions[8],
  //         y,
  //       );
  //       doc.text(
  //         emp.employmentDate ? new Date(emp.employmentDate).toLocaleDateString() : '',
  //         xPositions[9],
  //         y,
  //       );
  //       doc.text(emp.accountInfo?.basicPay?.toFixed(2) || '', xPositions[10], y);
  //       doc.text(emp.accountInfo?.allowances?.toFixed(2) || '', xPositions[11], y);
  //       doc.text(emp.accountInfo?.bankName || '', xPositions[12], y);
  //       y += 15;
  //     });
  //   }

  //   doc.end();
  // }

  // ------------------- PDF EXPORT --------------------
//  static async exportPDF(
//   summary: any,
//   employees: IUser[],
//   companyData: any,
//   res: Response,
//   filename: string,
// ) {
//   console.log('Exporting PDF with summary:', summary);
//   console.log('Exporting PDF with employees count:', employees?.length);
//   console.log('Exporting PDF with company data:', companyData?.name);
//   console.log('Exporting PDF with filename:', filename);
  
//   res.setHeader('Content-Type', 'application/pdf');
//   res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

//   const doc = new PDFDocument({ margin: 30 });

//   const fontPath = path.resolve(__dirname, '../assets/fonts/Roboto-Regular.ttf');
//   doc.registerFont('Main', fontPath);
//   doc.font('Main');

//   doc.pipe(res);

//   // Company logo / name
//   if (companyData?.branding?.logoUrl) {
//     try {
//       const logoResp = await axios.get(companyData.branding.logoUrl, {
//         responseType: 'arraybuffer',
//       });
//       doc.image(Buffer.from(logoResp.data, 'binary'), { width: 100, align: 'center' });
//     } catch (err) {
//       console.log('Logo fetch failed:', err);
//       doc.fontSize(18).text(companyData?.name || '', { align: 'center' });
//     }
//   } else {
//     doc.fontSize(18).text(companyData?.name || '', { align: 'center' });
//   }

//   doc.moveDown(2);
//   doc
//     .fontSize(22)
//     .text(
//       summary.reportType === 'department_analysis'
//         ? 'Department Analysis Report'
//         : 'Employment Summary Report',
//       { align: 'center', underline: true },
//     );
//   doc.moveDown(1);

//   // Summary table
//   if (summary.reportType === 'department_analysis') {
//     doc.fontSize(14).text('Department Data:', { underline: true });
//     summary.data.forEach((dept: any) => {
//       doc
//         .fontSize(12)
//         .text(
//           `${dept.department} - Employees: ${dept.totalEmployees}, Avg Salary: ${dept.avgSalary?.toFixed?.(2) || 0}`,
//         );
//     });
//   } else {
//     doc.fontSize(14).text('Summary:', { underline: true });
//     Object.entries(summary).forEach(([key, value]) => {
//       if (key !== 'reportType') doc.fontSize(12).text(`${key}: ${value}`);
//     });
//   }

//   // Charts
//   const { barChart, pieChart } = await this.getCharts(summary);
//   if (barChart)
//     doc.addPage().image(barChart, { fit: [700, 400], align: 'center', valign: 'center' });
//   if (pieChart)
//     doc.addPage().image(pieChart, { fit: [700, 400], align: 'center', valign: 'center' });

//   // Employee list (extended)
//   if (summary.reportType !== 'department_analysis') {
//     doc.addPage();
//     doc.fontSize(14).text('Employee List:', { underline: true });

//     const headers = [
//       'EmployeeId',
//       'Name',
//       'Email',
//       'Mobile',
//       'Alt Phone',
//       'Dept',
//       'Position',
//       'Branch',
//       'Level',
//       'State',
//       'LGA',
//       'Town',
//       'Address',
//       'City',
//       'DOB',
//       'ID Type',
//       'ID Num',
//       'NIN',
//       'Emp Date',
//       'Deps',
//       'Basic',
//       'Allow',
//       'Total',
//       'Kobo',
//       'Bank',
//       'Status',
//     ];
    
//     const colWidth = 65;
//     const tableTop = doc.y + 15;
//     doc.fontSize(6.5);
    
//     console.log('Drawing headers at y:', tableTop);
    
//     // Draw headers
//     headers.forEach((h, i) => {
//       doc.text(h, 30 + (i * colWidth), tableTop, { width: colWidth, align: 'left' });
//     });

//     let y = tableTop + 20;
//     let rowCount = 0;
    
//     console.log('Starting employee rows at y:', y);
    
//     employees.forEach((emp, index) => {
//       try {
//         console.log(`Processing row ${index}:`, emp?.staffId, emp?.email);
        
//         // Safely get values with defaults
//         const fullName = `${emp?.title || ''} ${emp?.firstName || ''} ${emp?.middleName || ''} ${emp?.lastName || ''}`.trim();
//         const dob = emp?.dateOfBirth ? new Date(emp.dateOfBirth).toLocaleDateString() : '';
//         const empDate = emp?.employmentDate ? new Date(emp.employmentDate).toLocaleDateString() : '';
//         const basicPay = emp?.accountInfo?.basicPay?.toFixed?.(2) || '';
//         const allowances = emp?.accountInfo?.allowances?.toFixed?.(2) || '';
        
//         doc.text(emp?.staffId || '', 30 + (0 * colWidth), y, { width: colWidth });
//         doc.text(fullName, 30 + (1 * colWidth), y, { width: colWidth });
//         doc.text(emp?.email || '', 30 + (2 * colWidth), y, { width: colWidth });
//         doc.text(emp?.mobile || '', 30 + (3 * colWidth), y, { width: colWidth });
//         doc.text(emp?.alternatePhoneNumber || '', 30 + (4 * colWidth), y, { width: colWidth });
//         doc.text(emp?.department || '', 30 + (5 * colWidth), y, { width: colWidth });
//         doc.text(emp?.position || '', 30 + (6 * colWidth), y, { width: colWidth });
//         doc.text(emp?.officeBranch || '', 30 + (8 * colWidth), y, { width: colWidth });
//         doc.text(emp?.level || '', 30 + (9 * colWidth), y, { width: colWidth });
//         doc.text(emp?.stateOfOrigin || '', 30 + (10 * colWidth), y, { width: colWidth });
//         doc.text(emp?.lga || '', 30 + (11 * colWidth), y, { width: colWidth });
//         doc.text(emp?.town || '', 30 + (12 * colWidth), y, { width: colWidth });
//         doc.text(emp?.address || '', 30 + (13 * colWidth), y, { width: colWidth });
//         doc.text(emp?.city || '', 30 + (14 * colWidth), y, { width: colWidth });
//         doc.text(dob, 30 + (15 * colWidth), y, { width: colWidth });
//         doc.text(emp?.meansOfIdentification || '', 30 + (16 * colWidth), y, { width: colWidth });
//         doc.text(emp?.meansOfIdentificationNumber || '', 30 + (17 * colWidth), y, { width: colWidth });
//         doc.text(emp?.nationalIdNumber || '', 30 + (18 * colWidth), y, { width: colWidth });
//         doc.text(empDate, 30 + (19 * colWidth), y, { width: colWidth });
//         doc.text(emp?.numberOfPrimaryDependants?.toString() || '', 30 + (20 * colWidth), y, { width: colWidth });
//         doc.text(basicPay, 30 + (21 * colWidth), y, { width: colWidth });
//         doc.text(allowances, 30 + (22 * colWidth), y, { width: colWidth });
//         doc.text(emp?.totalMonthlyEarnings?.toFixed?.(2) || '', 30 + (23 * colWidth), y, { width: colWidth });
//         doc.text(emp?.kobo?.toString() || '', 30 + (24 * colWidth), y, { width: colWidth });
//         doc.text(emp?.accountInfo?.bankName || '', 30 + (25 * colWidth), y, { width: colWidth });
//         doc.text(emp?.status || '', 30 + (26 * colWidth), y, { width: colWidth });
        
//         y += 20;
//         rowCount++;
        
//         // Add new page if needed
//         if (y > doc.page.height - 50) {
//           console.log('Adding new page at row', rowCount);
//           doc.addPage();
//           y = 50;
          
//           // Redraw headers on new page
//           headers.forEach((h, i) => {
//             doc.text(h, 30 + (i * colWidth), y, { width: colWidth, align: 'left' });
//           });
//           y += 20;
//         }
//       } catch (err) {
//         console.error(`Error processing employee row ${index}:`, err);
//         console.error('Employee data:', JSON.stringify(emp, null, 2));
//         // Continue with next row instead of crashing
//       }
//     });
    
//     console.log('Finished drawing', rowCount, 'rows');
//   }

//   console.log('Finalizing PDF...');
//   doc.end();
//   console.log('PDF export complete');
// }

static async exportPDF(
  summary: any,
  employees: IUser[],
  companyData: any,
  res: Response,
  filename: string,
) {
  
  try {
    // Validate inputs first
    if (!employees || !Array.isArray(employees)) {
      throw new Error('Invalid employees data: ' + typeof employees);
    }
    
    if (!companyData) {
      throw new Error('Missing company data');
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const doc = new PDFDocument({ margin: 30 });
    
    // Check font file exists
    const fontPath = path.resolve(__dirname, '../assets/fonts/Roboto-Regular.ttf');
    
    if (!require('fs').existsSync(fontPath)) {
      doc.font('Helvetica');
    } else {
      doc.registerFont('Main', fontPath);
      doc.font('Main');
    }

    // Handle stream errors
    doc.on('error', (_:any) => {

    });

    doc.pipe(res);

    // Header section
    try {
      if (companyData?.branding?.logoUrl) {
        try {
          const logoResp = await axios.get(companyData.branding.logoUrl, {
            responseType: 'arraybuffer',
            timeout: 5000,
          });
          doc.image(Buffer.from(logoResp.data, 'binary'), { width: 100, align: 'center' });
        } catch (logoErr) {
          doc.fontSize(18).text(companyData?.name || '', { align: 'center' });
        }
      } else {
        doc.fontSize(18).text(companyData?.name || '', { align: 'center' });
      }

      doc.moveDown(2);
      doc.fontSize(22).text(
        summary?.reportType === 'department_analysis'
          ? 'Department Analysis Report'
          : 'Employment Summary Report',
        { align: 'center', underline: true },
      );
      doc.moveDown(1);
    } catch (headerErr) {
    }

    // Summary section
    try {
      if (summary?.reportType === 'department_analysis') {
        doc.fontSize(14).text('Department Data:', { underline: true });
        summary.data?.forEach((dept: any) => {
          const line = `${dept?.department || 'N/A'} - Employees: ${dept?.totalEmployees || 0}, Avg Salary: ${dept?.avgSalary || 0}`;
          doc.fontSize(12).text(line);
        });
      } else {
        doc.fontSize(14).text('Summary:', { underline: true });
        Object.entries(summary || {}).forEach(([key, value]) => {
          if (key !== 'reportType') {
            doc.fontSize(12).text(`${key}: ${value}`);
          }
        });
      }
    } catch (summaryErr) {
    }

    // Charts section
    try {
      const { barChart, pieChart } = await this.getCharts(summary);
      if (barChart) {
        doc.addPage();
        doc.image(barChart, { fit: [700, 400], align: 'center', valign: 'center' });
      }
      if (pieChart) {
        doc.addPage();
        doc.image(pieChart, { fit: [700, 400], align: 'center', valign: 'center' });
      }
    } catch (chartErr) {
      // Continue without charts
    }

    // Employee table - THE CRITICAL SECTION
    if (summary?.reportType !== 'department_analysis' && employees.length > 0) {
      
      doc.addPage();
      doc.fontSize(14).text('Employee List:', { underline: true });

      // Simplified headers - fewer columns to avoid overflow
      const headers = [
        'EmpID', 'Name', 'Email', 'Dept', 'Position', 
        'Mobile', 'DOB', 'Basic', 'Allow', 'Status'
      ];
      
      const colWidth = 80;
      const startX = 30;
      let y = doc.y + 20;
      
      doc.fontSize(8);
      
      // Draw headers
      headers.forEach((h, i) => {
        doc.text(h, startX + (i * colWidth), y);
      });
      
      y += 20;

      // Process employees in batches with error isolation
      let successCount = 0;
      let errorCount = 0;
      
      for (let i = 0; i < employees.length; i++) {
        const emp = employees[i];
        
        // Strict validation
        if (!emp || typeof emp !== 'object') {
          errorCount++;
          continue;
        }

        try {
          // Safe value extraction
          const safeString = (val: any) => String(val || '').substring(0, 30);
          const safeNumber = (val: any) => {
            const n = Number(val);
            return isNaN(n) ? '' : n.toFixed(2);
          };
          const safeDate = (val: any) => {
            if (!val) return '';
            try {
              return new Date(val).toLocaleDateString();
            } catch {
              return '';
            }
          };

          const fullName = safeString(`${emp.title || ''} ${emp.firstName || ''} ${emp.lastName || ''}`.trim());

          const row = [
            safeString(emp.staffId),
            fullName,
            safeString(emp.email),
            safeString(emp.department),
            safeString(emp.position),
            safeString(emp.mobile),
            safeDate(emp.dateOfBirth),
            safeNumber(emp.accountInfo?.basicPay),
            safeNumber(emp.accountInfo?.allowances),
            safeString(emp.status),
          ];

          // Draw row
          row.forEach((text, colIdx) => {
            doc.text(text, startX + (colIdx * colWidth), y);
          });

          y += 15;
          successCount++;

          // Page break check
          if (y > 750) {
            doc.addPage();
            y = 50;
            // Redraw headers
            headers.forEach((h, i) => {
              doc.text(h, startX + (i * colWidth), y);
            });
            y += 20;
          }

        } catch (rowErr) {
          errorCount++;
          // Continue to next employee
        }
      }
      
    }

    doc.end();

  } catch (error) {

    
    if (!res.headersSent) {
      res.status(500).json({ 
        error: 'Failed to generate report', 
      });
    }
  }
}


  // // ------------------- EXCEL EXPORT --------------------
  // static async exportExcel(summary: any, employees: IUser[], res: Response, filename: string) {
  //   res.setHeader(
  //     'Content-Type',
  //     'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  //   );
  //   res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  //   const workbook = new ExcelJS.Workbook();

  //   // Summary / Data sheet
  //   if (summary.reportType === 'department_analysis') {
  //     const deptSheet = workbook.addWorksheet('Department Analysis');
  //     deptSheet.addRow(['Department', 'Total Employees', 'Average Salary']);
  //     summary.data.forEach((d: any) =>
  //       deptSheet.addRow([d.department, d.totalEmployees, d.avgSalary]),
  //     );
  //   } else {
  //     const summarySheet = workbook.addWorksheet('Summary');
  //     summarySheet.addRow(['Metric', 'Value']);
  //     for (const [key, value] of Object.entries(summary)) {
  //       if (key !== 'reportType') summarySheet.addRow([key, value]);
  //     }
  //   }

  //   if (summary.reportType !== 'department_analysis') {
  //     const empSheet = workbook.addWorksheet('Employees');
  //     empSheet.columns = [
  //       { header: 'Staff ID', key: 'staffId', width: 12 },
  //       { header: 'Title', key: 'title', width: 8 },
  //       { header: 'First Name', key: 'firstName', width: 15 },
  //       { header: 'Middle Name', key: 'middleName', width: 15 },
  //       { header: 'Last Name', key: 'lastName', width: 15 },
  //       { header: 'Gender', key: 'gender', width: 10 },
  //       { header: 'DOB', key: 'dateOfBirth', width: 12 },
  //       { header: 'Email', key: 'email', width: 25 },
  //       { header: 'Mobile', key: 'mobile', width: 15 },
  //       { header: 'Department', key: 'department', width: 15 },
  //       { header: 'Position', key: 'position', width: 20 },
  //       { header: 'Branch', key: 'officeBranch', width: 15 },
  //       { header: 'Level', key: 'level', width: 10 },
  //       { header: 'Employment Date', key: 'employmentDate', width: 15 },
  //       { header: 'Basic Pay', key: 'basicPay', width: 12 },
  //       { header: 'Allowances', key: 'allowances', width: 12 },
  //       { header: 'Bank Name', key: 'bankName', width: 20 },
  //       { header: 'Account Number', key: 'bankAccountNumber', width: 20 },
  //       { header: 'Tax Number', key: 'taxNumber', width: 20 },
  //       { header: 'Pension Company', key: 'pensionCompany', width: 20 },
  //       { header: 'Pension Number', key: 'pensionNumber', width: 20 },
  //       { header: 'Coop Monthly Contribution', key: 'coopMonthly', width: 20 },
  //       { header: 'Coop Total', key: 'coopTotal', width: 20 },
  //       { header: 'Status', key: 'status', width: 15 },
  //     ];

  //     employees.forEach((emp) => {
  //       empSheet.addRow({
  //         staffId: emp.staffId,
  //         title: emp.title,
  //         firstName: emp.firstName,
  //         middleName: emp.middleName,
  //         lastName: emp.lastName,
  //         gender: emp.gender,
  //         dateOfBirth: emp.dateOfBirth ? new Date(emp.dateOfBirth).toLocaleDateString() : '',
  //         email: emp.email,
  //         mobile: emp.mobile,
  //         department: emp.department,
  //         position: emp.position,
  //         officeBranch: emp.officeBranch,
  //         level: emp.level,
  //         employmentDate: emp.employmentDate
  //           ? new Date(emp.employmentDate).toLocaleDateString()
  //           : '',
  //         basicPay: emp.accountInfo?.basicPay,
  //         allowances: emp.accountInfo?.allowances,
  //         bankName: emp.accountInfo?.bankName,
  //         bankAccountNumber: emp.accountInfo?.bankAccountNumber,
  //         taxNumber: emp.accountInfo?.taxNumber,
  //         pensionCompany: emp.accountInfo?.pensionCompany,
  //         pensionNumber: emp.accountInfo?.pensionNumber,
  //         coopMonthly: emp.cooperative?.monthlyContribution,
  //         coopTotal: emp.cooperative?.totalContributed,
  //         status: emp.status,
  //       });
  //     });
  //   }

  //   // Charts sheet
  //   const { barChart, pieChart } = await this.getCharts(summary);
  //   if (barChart || pieChart) {
  //     const chartSheet = workbook.addWorksheet('Charts');
  //     if (barChart) {
  //       const barImageId = workbook.addImage({
  //         buffer: Buffer.from(barChart),
  //         extension: 'png',
  //       });
  //       chartSheet.addImage(barImageId, 'A1:J20');
  //     }
  //     if (pieChart) {
  //       const pieImageId = workbook.addImage({ buffer: Buffer.from(pieChart), extension: 'png' });
  //       chartSheet.addImage(pieImageId, 'A22:J42');
  //     }
  //   }

  //   // await workbook.xlsx.write(res);
  //   // res.end();
  //   const buffer = await workbook.xlsx.writeBuffer();

  //   res.setHeader(
  //     'Content-Type',
  //     'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  //   );
  //   res.setHeader(
  //     'Content-Disposition',
  //     `attachment; filename="${filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`}"`,
  //   );

  //   res.send(Buffer.from(buffer));
  // }


  // ------------------- EXCEL EXPORT --------------------
  static async exportExcel(summary: any, employees: IUser[], res: Response, filename: string) {
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const workbook = new ExcelJS.Workbook();

    // Summary / Data sheet
    if (summary.reportType === 'department_analysis') {
      const deptSheet = workbook.addWorksheet('Department Analysis');
      deptSheet.addRow(['Department', 'Total Employees', 'Average Salary']);
      summary.data.forEach((d: any) =>
        deptSheet.addRow([d.department, d.totalEmployees, d.avgSalary]),
      );
    } else {
      const summarySheet = workbook.addWorksheet('Summary');
      summarySheet.addRow(['Metric', 'Value']);
      for (const [key, value] of Object.entries(summary)) {
        if (key !== 'reportType') summarySheet.addRow([key, value]);
      }
    }

    if (summary.reportType !== 'department_analysis') {
      const empSheet = workbook.addWorksheet('Employees');
      empSheet.columns = [
        { header: 'EmployeeId', key: 'staffId', width: 12 },
        { header: 'Title', key: 'title', width: 8 },
        { header: 'First Name', key: 'firstName', width: 15 },
        { header: 'Middle Name', key: 'middleName', width: 15 },
        { header: 'Last Name', key: 'lastName', width: 15 },
        { header: 'Gender', key: 'gender', width: 10 },
        { header: 'DOB', key: 'dateOfBirth', width: 12 },
        { header: 'State of Origin', key: 'stateOfOrigin', width: 15 },
        { header: 'LGA', key: 'lga', width: 15 },
        { header: 'Town', key: 'town', width: 15 },
        { header: 'Address', key: 'address', width: 25 },
        { header: 'City', key: 'city', width: 15 },
        { header: 'Email', key: 'email', width: 25 },
        { header: 'Mobile', key: 'mobile', width: 15 },
        { header: 'Alternate Phone', key: 'alternatePhoneNumber', width: 15 },
        { header: 'Means of ID', key: 'meansOfIdentification', width: 20 },
        { header: 'ID Number', key: 'meansOfIdentificationNumber', width: 20 },
        { header: 'State of Issuance', key: 'stateOfIssuance', width: 18 },
        { header: 'National ID (NIN)', key: 'nationalIdNumber', width: 18 },
        { header: 'Department', key: 'department', width: 15 },
        { header: 'Position', key: 'position', width: 20 },
        { header: 'Branch', key: 'officeBranch', width: 15 },
        { header: 'Level', key: 'level', width: 10 },
        { header: 'Employment Date', key: 'employmentDate', width: 15 },
        { header: 'Number of Dependants', key: 'numberOfPrimaryDependants', width: 18 },
        { header: 'Basic Pay', key: 'basicPay', width: 12 },
        { header: 'Allowances', key: 'allowances', width: 12 },
        { header: 'Total Monthly Earnings', key: 'totalMonthlyEarnings', width: 20 },
        { header: 'Kobo', key: 'kobo', width: 12 },
        { header: 'Bank Name', key: 'bankName', width: 20 },
        { header: 'Account Number', key: 'bankAccountNumber', width: 20 },
        { header: 'Tax Number', key: 'taxNumber', width: 20 },
        { header: 'Pension Company', key: 'pensionCompany', width: 20 },
        { header: 'Pension Number', key: 'pensionNumber', width: 20 },
        { header: 'Coop Monthly Contribution', key: 'coopMonthly', width: 22 },
        { header: 'Coop Total Contributed', key: 'coopTotal', width: 20 },
        { header: 'Status', key: 'status', width: 15 },
      ];

      employees.forEach((emp) => {
        empSheet.addRow({
          staffId: emp.staffId,
          title: emp.title,
          firstName: emp.firstName,
          middleName: emp.middleName,
          lastName: emp.lastName,
          gender: emp.gender,
          dateOfBirth: emp.dateOfBirth ? new Date(emp.dateOfBirth).toLocaleDateString() : '',
          stateOfOrigin: emp.stateOfOrigin,
          lga: emp.lga,
          town: emp.town,
          address: emp.address,
          city: emp.city,
          email: emp.email,
          mobile: emp.mobile,
          alternatePhoneNumber: emp.alternatePhoneNumber,
          meansOfIdentification: emp.meansOfIdentification,
          meansOfIdentificationNumber: emp.meansOfIdentificationNumber,
          stateOfIssuance: emp.stateOfIssuance,
          nationalIdNumber: emp.nationalIdNumber,
          department: emp.department,
          position: emp.position,
          officeBranch: emp.officeBranch,
          level: emp.level,
          employmentDate: emp.employmentDate
            ? new Date(emp.employmentDate).toLocaleDateString()
            : '',
          numberOfPrimaryDependants: emp.numberOfPrimaryDependants,
          basicPay: emp.accountInfo?.basicPay,
          allowances: emp.accountInfo?.allowances,
          totalMonthlyEarnings: emp.totalMonthlyEarnings,
          kobo: emp.kobo,
          bankName: emp.accountInfo?.bankName,
          bankAccountNumber: emp.accountInfo?.bankAccountNumber,
          taxNumber: emp.accountInfo?.taxNumber,
          pensionCompany: emp.accountInfo?.pensionCompany,
          pensionNumber: emp.accountInfo?.pensionNumber,
          coopMonthly: emp.cooperative?.monthlyContribution,
          coopTotal: emp.cooperative?.totalContributed,
          status: emp.status,
        });
      });
    }

    // Charts sheet
    const { barChart, pieChart } = await this.getCharts(summary);
    if (barChart || pieChart) {
      const chartSheet = workbook.addWorksheet('Charts');
      if (barChart) {
        const barImageId = workbook.addImage({
          buffer: Buffer.from(barChart),
          extension: 'png',
        });
        chartSheet.addImage(barImageId, 'A1:J20');
      }
      if (pieChart) {
        const pieImageId = workbook.addImage({ buffer: Buffer.from(pieChart), extension: 'png' });
        chartSheet.addImage(pieImageId, 'A22:J42');
      }
    }

    const buffer = await workbook.xlsx.writeBuffer();

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`}"`,
    );

    res.send(Buffer.from(buffer));
  }

  static async exportAttendanceExcel(
    summary: any,
    records: (IAttendance & { user: IUser })[],
    res: Response,
    filename: string,
  ) {
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const workbook = new ExcelJS.Workbook();

    // Summary sheet
    const summarySheet = workbook.addWorksheet('Summary');
    summarySheet.addRow(['Metric', 'Value']);
    for (const [key, value] of Object.entries(summary)) {
      if (key !== 'reportType') summarySheet.addRow([key, value]);
    }

    // Attendance Records sheet
    const attSheet = workbook.addWorksheet('Attendance');
    attSheet.columns = [
      { header: 'Staff ID', key: 'staffId', width: 12 },
      { header: 'First Name', key: 'firstName', width: 15 },
      { header: 'Last Name', key: 'lastName', width: 15 },
      { header: 'Department', key: 'department', width: 15 },
      { header: 'Date', key: 'date', width: 15 },
      { header: 'Shift', key: 'shift', width: 10 },
      { header: 'Check In', key: 'checkIn', width: 20 },
      { header: 'Check Out', key: 'checkOut', width: 20 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Hours Worked', key: 'hoursWorked', width: 15 },
    ];

    records.forEach((rec) => {
      const user = rec.user as IUser;
      attSheet.addRow({
        staffId: user?.staffId || 'N/A',
        firstName: user?.firstName || '',
        lastName: user?.lastName || '',
        department: rec.department,
        date: rec.date,
        shift: rec.shift,
        checkIn: rec.checkIn ? new Date(rec.checkIn).toLocaleString() : '',
        checkOut: rec.checkOut ? new Date(rec.checkOut).toLocaleString() : '',
        status: rec.status,
        hoursWorked: rec.hoursWorked ?? 0,
      });
    });

    // await workbook.xlsx.write(res);
    // res.end();
    const buffer = await workbook.xlsx.writeBuffer();

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`}"`,
    );

    res.send(Buffer.from(buffer));
  }

  static async generatePayrollPDF(
    arg1: any | Array<{ payroll: any; employee: IUser }>,
    arg2: any | IUser,
    arg3?: any,
  ): Promise<Buffer> {
    // ✅ Capitalize helper
    const capitalizeWords = (str: string | undefined | null): string => {
      if (!str) return '';
      return str
        .toLowerCase()
        .split(' ')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
    };

    return new Promise(async (resolve, reject) => {
      try {
        let companyData: any;
        let items: Array<{ payroll: any; employee: IUser }>;

        if (Array.isArray(arg1)) {
          items = arg1;
          companyData = arg2;
        } else {
          items = [{ payroll: arg1, employee: arg2 as IUser }];
          companyData = arg3;
        }

        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        const chunks: Uint8Array[] = [];
        doc.on('data', (c: Uint8Array<ArrayBufferLike>) => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', (err: any) => reject(err));
        const robotoRegular = path.resolve(process.cwd(), 'public/assets/fonts/Roboto-Regular.ttf');
        const robotoBold = path.resolve(process.cwd(), 'public/assets/fonts/Roboto-Bold.ttf');

        doc.registerFont('Roboto', robotoRegular);
        doc.registerFont('Roboto-Bold', robotoBold);

        // Use Roboto by default
        doc.font('Roboto');

        let logoBuffer: Buffer | null = null;
        if (companyData?.branding?.logoUrl) {
          try {
            const resp = await axios.get(companyData.branding.logoUrl, {
              responseType: 'arraybuffer',
            });
            logoBuffer = Buffer.from(resp.data, 'binary');
          } catch {
            logoBuffer = null;
          }
        }

        items.forEach(({ payroll, employee }, index) => {
          if (index > 0) doc.addPage();

          if (logoBuffer) {
            doc.image(logoBuffer, 50, 30, { width: 80 });
          } else {
            doc.fontSize(20).text(capitalizeWords(companyData?.name) || '', { align: 'center' });
          }

          doc.moveDown(0.5);
          doc
            .fontSize(16)
            .fillColor('gray')
            .text(capitalizeWords(companyData?.address) || '', { align: 'center' });
          doc.moveDown(1.5);

          doc.fontSize(18).fillColor('black').text('PAYSLIP', { align: 'center', underline: true });
          doc.moveDown(2);

          const monthName = getMonthName(Number(payroll.month));
          doc.fontSize(12).fillColor('black');
          const leftX = 50,
            rightX = 300;
          let y = doc.y;

          doc.text(
            `Name: ${capitalizeWords(employee.firstName)} ${capitalizeWords(employee.lastName)}`,
            leftX,
            y,
          );
          doc.text(`Department: ${capitalizeWords(employee.department) || ''}`, rightX, y);
          y += 20;
          doc.text(`Position: ${capitalizeWords(employee.position) || ''}`, leftX, y);
          doc.text(`Payroll Month: ${capitalizeWords(monthName)} ${payroll.year}`, rightX, y);
          doc.moveDown(2);

          // ===== EARNINGS =====
          doc.fontSize(13).font('Roboto-Bold').text('EARNINGS', leftX, doc.y, { underline: true });
          doc.moveDown(0.5);

          const labelX = 70,
            valueX = 450;
          doc.font('Roboto').fontSize(12);

          doc.text('Basic Salary', labelX, doc.y);
          doc.text(formatCurrency(payroll.basicSalary), valueX, doc.y, { align: 'right' });
          doc.moveDown(0.5);

          doc.text('Allowances', labelX, doc.y);
          doc.text(formatCurrency(payroll.totalAllowances), valueX, doc.y, { align: 'right' });
          doc.moveDown(0.5);

          doc.font('Roboto-Bold').text('Gross Salary', labelX, doc.y);
          doc.text(formatCurrency(payroll.grossSalary), valueX, doc.y, { align: 'right' });
          doc.font('Roboto');
          doc.moveDown(2);

          // ===== DEDUCTIONS =====
          doc
            .fontSize(13)
            .font('Roboto-Bold')
            .text('DEDUCTIONS', leftX, doc.y, { underline: true });
          doc.moveDown(0.5);

          doc.font('Roboto').text('Pension', labelX, doc.y);
          doc.text(formatCurrency(payroll.pension), valueX, doc.y, { align: 'right' });
          doc.moveDown(0.5);

          doc.text('Tax', labelX, doc.y);
          doc.text(formatCurrency(payroll.tax), valueX, doc.y, { align: 'right' });
          doc.moveDown(2);

          // ===== NET SALARY =====
          doc.fontSize(16).font('Roboto-Bold').fillColor('green').text('Net Salary', labelX, doc.y);
          doc.text(formatCurrency(payroll.netSalary), valueX, doc.y, { align: 'right' });

          doc.moveDown(4);
          doc
            .fontSize(10)
            .fillColor('gray')
            .font('Roboto')
            .text('This is a system-generated payslip.', { align: 'center' });
        });

        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }

  static async generatePayrollExcel(
    arg1: any | Array<{ payroll: any; employee: IUser }>,
    arg2: any | IUser,
    arg3?: any,
  ): Promise<Buffer> {
    // ✅ Capitalize helper
    const capitalizeWords = (str: string | undefined | null): string => {
      if (!str) return '';
      return str
        .toLowerCase()
        .split(' ')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
    };

    // Normalize args
    let companyData: any;
    let items: Array<{ payroll: any; employee: IUser }>;

    if (Array.isArray(arg1)) {
      items = arg1;
      companyData = arg2;
    } else {
      items = [{ payroll: arg1, employee: arg2 as IUser }];
      companyData = arg3;
    }

    const workbook = new ExcelJS.Workbook();

    if (items.length === 1) {
      const sheet = workbook.addWorksheet('Payroll Slip');

      sheet.columns = [
        { header: 'Field', key: 'field', width: 30 },
        { header: 'Value', key: 'value', width: 30 },
      ];

      sheet.getRow(1).font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
      sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2F75B5' } };

      const { payroll, employee } = items[0];
      const monthName = getMonthName(Number(payroll.month));

      sheet.addRow(['Company', capitalizeWords(companyData?.name) || '']);
      sheet.addRow(['Payroll Month', `${capitalizeWords(monthName)} ${payroll.year}`]);
      sheet.addRow([]);
      sheet.addRow(['Employee Details', '']);
      sheet.lastRow!.font = { bold: true };

      sheet.addRow([
        'Name',
        `${capitalizeWords(employee.firstName)} ${capitalizeWords(employee.lastName)}`,
      ]);
      sheet.addRow(['Department', capitalizeWords(employee.department) || '']);
      sheet.addRow(['Position', capitalizeWords(employee.position) || '']);
      sheet.addRow([]);

      sheet.addRow(['Earnings', '']);
      sheet.lastRow!.font = { bold: true };
      sheet.addRow(['Basic Salary', formatCurrency(payroll.basicSalary)]);
      sheet.addRow(['Allowances', formatCurrency(payroll.totalAllowances)]);
      sheet.addRow(['Gross Salary', formatCurrency(payroll.grossSalary)]);
      sheet.addRow([]);

      sheet.addRow(['Deductions', '']);
      sheet.lastRow!.font = { bold: true };
      sheet.addRow(['Pension', formatCurrency(payroll.pension)]);
      sheet.addRow(['Tax', formatCurrency(payroll.tax)]);
      sheet.addRow([]);

      sheet.addRow(['Net Salary', formatCurrency(payroll.netSalary)]);
      sheet.lastRow!.font = { bold: true, color: { argb: 'FF228B22' } };
    } else {
      const sheet = workbook.addWorksheet('Payroll (Bulk)');

      sheet.columns = [
        { header: 'Employee', key: 'employee', width: 28 },
        { header: 'Department', key: 'department', width: 20 },
        { header: 'Position', key: 'position', width: 22 },
        { header: 'Payroll Month', key: 'payrollMonth', width: 18 },
        { header: 'Basic Salary', key: 'basicSalary', width: 18 },
        { header: 'Allowances', key: 'allowances', width: 18 },
        { header: 'Gross Salary', key: 'grossSalary', width: 18 },
        { header: 'Pension', key: 'pension', width: 16 },
        { header: 'Tax', key: 'tax', width: 16 },
        { header: 'Net Salary', key: 'netSalary', width: 18 },
      ];

      sheet.getRow(1).font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
      sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2F75B5' } };

      items.forEach(({ payroll, employee }) => {
        const monthName = getMonthName(Number(payroll.month));
        sheet.addRow({
          employee: `${capitalizeWords(employee.firstName)} ${capitalizeWords(employee.lastName)}`,
          department: capitalizeWords(employee.department) || '',
          position: capitalizeWords(employee.position) || '',
          payrollMonth: `${capitalizeWords(monthName)} ${payroll.year}`,
          basicSalary: formatCurrency(payroll.basicSalary),
          allowances: formatCurrency(payroll.totalAllowances),
          grossSalary: formatCurrency(payroll.grossSalary),
          pension: formatCurrency(payroll.pension),
          tax: formatCurrency(payroll.tax),
          netSalary: formatCurrency(payroll.netSalary),
        });
      });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  static async exportPayrollExcel(
    summary: any,
    payrolls: (IPayroll & { user: IUser })[],
    res: Response,
    filename: string,
  ) {
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const workbook = new ExcelJS.Workbook();

    // Summary sheet
    const summarySheet = workbook.addWorksheet('Summary');
    summarySheet.addRow(['Metric', 'Value']);
    for (const [key, value] of Object.entries(summary)) {
      if (key !== 'reportType') summarySheet.addRow([key, value]);
    }



    // Payroll sheet
    const payrollSheet = workbook.addWorksheet('Payroll');
    payrollSheet.columns = [
      { header: 'Staff ID', key: 'staffId', width: 12 },
      { header: 'First Name', key: 'firstName', width: 15 },
      { header: 'Last Name', key: 'lastName', width: 15 },
      { header: 'Department', key: 'department', width: 15 },
      { header: 'Class Level', key: 'classLevel', width: 12 },
      { header: 'Basic Salary', key: 'basicSalary', width: 12 },
      { header: 'Total Allowances', key: 'totalAllowances', width: 15 },
      { header: 'Gross Salary', key: 'grossSalary', width: 12 },
      { header: 'Pension', key: 'pension', width: 12 },
      { header: 'CRA', key: 'CRA', width: 12 },
      { header: 'Taxable Income', key: 'taxableIncome', width: 15 },
      { header: 'Tax', key: 'tax', width: 12 },
      { header: 'Net Salary', key: 'netSalary', width: 12 },
      { header: 'Month', key: 'month', width: 10 },
      { header: 'Year', key: 'year', width: 10 },
      { header: 'Status', key: 'status', width: 12 },
    ];

    payrolls.forEach((p) => {
      const user = p.user;
      payrollSheet.addRow({
        staffId: user.staffId,
        firstName: user.firstName,
        lastName: user.lastName,
        department: user.department,
        classLevel: p.classLevel,
        basicSalary: p.basicSalary,
        totalAllowances: p.totalAllowances,
        grossSalary: p.grossSalary,
        pension: p.pension,
        CRA: p.CRA,
        taxableIncome: p.taxableIncome,
        tax: p.tax,
        netSalary: p.netSalary,
        month: p.month,
        year: p.year,
        status: p.status,
      });
    });


    // await workbook.xlsx.write(res);
    // res.end();
    const buffer = await workbook.xlsx.writeBuffer();


    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`}"`,
    );

    return res.send(Buffer.from(buffer));
  }

static async exportPayrollSummaryPDF(
  summary: any,
  company: ICompany,
  meta: { month: number; year: number },
): Promise<Buffer> {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks: Uint8Array[] = [];

      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const robotoRegular = path.resolve(
        process.cwd(),
        'public/assets/fonts/Roboto-Regular.ttf',
      );
      const robotoBold = path.resolve(
        process.cwd(),
        'public/assets/fonts/Roboto-Bold.ttf',
      );

      doc.registerFont('Roboto', robotoRegular);
      doc.registerFont('Roboto-Bold', robotoBold);
      doc.font('Roboto');

      // ===== LOGO =====
      let logoBuffer: Buffer | null = null;
      if (company?.branding?.logoUrl) {
        try {
          const resp = await axios.get(company.branding.logoUrl, {
            responseType: 'arraybuffer',
          });
          logoBuffer = Buffer.from(resp.data);
        } catch {}
      }

      if (logoBuffer) {
        doc.image(logoBuffer, 50, 30, { width: 80 });
      }

      // ===== COMPANY NAME =====
      doc
        .font('Roboto-Bold')
        .fontSize(20)
        .text(company.branding?.displayName || company.name, 150, 40);

      doc
        .font('Roboto')
        .fontSize(12)
        .fillColor('gray')
        .text(`Payroll Summary – ${meta.month}/${meta.year}`, 150, 65);

      doc.moveDown(4);

      // ===== SUMMARY TABLE =====
      const startX = 70;
      let y = doc.y;

      const drawRow = (label: string, value: any) => {
        doc.font('Roboto').fontSize(12).fillColor('black');
        doc.text(label, startX, y);
        doc.text(String(value), 450, y, { align: 'right' });
        y += 20;
      };

      drawRow('Total Staff', summary.totalStaff);
      drawRow('Total Basic Salary', formatCurrency(summary.totalBasicSalary));
      drawRow('Total Allowances', formatCurrency(summary.totalAllowances));
      drawRow('Total Gross Salary', formatCurrency(summary.totalGrossSalary));
      drawRow('Total Pension', formatCurrency(summary.totalPension));
      drawRow('Total Tax', formatCurrency(summary.totalTax));

      doc.moveDown(2);

      // ===== GRAND TOTAL =====
      doc
        .font('Roboto-Bold')
        .fontSize(16)
        .fillColor('green')
        .text('Total Net Pay', startX, y);

      doc.text(
        formatCurrency(summary.totalNetSalary),
        450,
        y,
        { align: 'right' },
      );

      doc.moveDown(4);

      doc
        .fontSize(10)
        .fillColor('gray')
        .font('Roboto')
        .text(
          'This is a system-generated payroll summary.',
          { align: 'center' },
        );

      // ✅ VERY IMPORTANT
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}


}
