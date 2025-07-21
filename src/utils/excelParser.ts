
import * as XLSX from 'xlsx';

export interface ParsedUser {
  firstName: string;
  middleName: string;
  lastName: string;
  email: string;
  department:
    | 'it'
    | 'account'
    | 'hr'
    | 'channel'
    | 'retail'
    | 'operation'
    | 'corporate'
    | 'marketing'
    | 'md'
    | 'teamlead'
    | 'employee'
    | 'admin'
    | 'rg'
    | 'cm';
  role: 'md' | 'teamlead' | 'employee' | 'admin' | 'hr';
  startDate: string;
  salary: number;
  phoneNumber: string;
  dateOfBirth: string;
  position: string;
  address: string;
  company: string;
}

const getFormattedDate = (excelDate: any): string => {
  if (typeof excelDate === 'number') {
    const parsed = XLSX.SSF.parse_date_code(excelDate);
    if (parsed) {
      const { y, m, d } = parsed;
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }
  return String(excelDate).trim(); // fallback if already string or invalid
};

export const parseExcelUsers = (buffer: Buffer): ParsedUser[] => {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  if (!rows.length || rows[0].length < 13) {
    throw new Error('Invalid Excel file: missing headers or insufficient columns.');
  }

  const users: ParsedUser[] = rows.slice(1).map((row, index) => {
    if (row.length < 13) {
      return null;
    }

    return {
      email: String(row[0] || '').trim(),
      firstName: String(row[1] || '').trim(),
      middleName: String(row[2] || '').trim(),
      lastName: String(row[3] || '').trim(),
      role: String(row[4] || '').trim().toLowerCase() as ParsedUser['role'],
      department: String(row[5] || '').trim().toLowerCase() as ParsedUser['department'],
      startDate: getFormattedDate(row[6]),
      salary: Number(row[7] || 0),
      phoneNumber: String(row[8] || '').trim(),
      dateOfBirth: getFormattedDate(row[9]),
      position: String(row[10] || '').trim(),
      address: String(row[11] || '').trim(),
      company: String(row[12] || '').trim(),
    };
  }).filter(Boolean) as ParsedUser[];

  return users;
};


export interface ParsedPayroll {
  email: string;
  month: string;
  year: number;
  basicSalary: number;
  allowances: { title: string; amount: number }[];
  deductions: { title: string; amount: number }[];
}

export const parseExcelPayroll = (buffer: Buffer): ParsedPayroll[] => {
  // Read workbook directly from buffer
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  return rows.map(row => ({
    email: row['Email']?.trim(),
    month: row['Month']?.trim(),
    year: parseInt(row['Year'], 10),
    basicSalary: parseFloat(row['Basic Salary']) || 0,
    allowances: safeParseJSON(row['Allowances']),
    deductions: safeParseJSON(row['Deductions']),
  }));
};

// Safe JSON parse helper to avoid crashes on bad data
const safeParseJSON = (value: string): { title: string; amount: number }[] => {
  try {
    if (!value) return [];
    return JSON.parse(value);
  } catch {
    return [];
  }
};
