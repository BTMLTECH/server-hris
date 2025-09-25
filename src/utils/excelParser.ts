import * as XLSX from 'xlsx';
import { NIGERIAN_BANKS } from '../constant/const';

// =======================
// TYPES
// =======================
export interface ParsedAccountInfo {
  classLevel: string;
  basicPay: number;
  allowances: number;
  bankAccountNumber: string;
  bankName: string;
  taxNumber: string;
  pensionCompany: string;
  pensionNumber: string;
}

export interface ParsedNextOfKin {
  name: string;
  phone: string;
  email: string;
  relationship: string;
}

export interface ParsedUser {
  staffId: string;
  title: string;
  firstName: string;
  middleName: string;
  lastName: string;
  gender: string;
  dateOfBirth: string;
  stateOfOrigin: string;
  address: string;
  city: string;
  mobile: string;
  email: string;
  department: string;
  position: string;
  officeBranch: string;
  employmentDate: string;
  role: string;
  accountInfo: ParsedAccountInfo;
  nextOfKin: ParsedNextOfKin;
  requirements: any[];
  status: string;
}

export interface ParsedPayroll {
  email: string;
  month: string;
  year: number;
  basicSalary: number;
  housingAllowance: number;
  transportAllowance: number;
  lasgAllowance: number;
  twentyFourHoursAllowance: number;
  healthAllowance: number;
  deductions: number;
}

export interface ParsedClassLevel {
  year: number;
  level: string;
  payGrade: string;
  grossSalary: number;
}

// export const getFormattedDate = (excelDate: unknown): string | null => {
//   if (excelDate === null || excelDate === undefined || String(excelDate).trim() === '') {
//     return null;
//   }

//   // Handle Excel numeric dates
//   if (typeof excelDate === 'number') {
//     const parsed = XLSX.SSF.parse_date_code(excelDate);
//     if (parsed) {
//       const { y, m, d } = parsed;
//       return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
//     }
//   }

//   const parsedDate = new Date(String(excelDate).trim());
//   if (!isNaN(parsedDate.getTime())) {
//     return parsedDate.toISOString().split('T')[0];
//   }

//   return null;
// };
export const getFormattedDate = (excelDate: unknown): string | null => {
  if (!excelDate || String(excelDate).trim() === '') return null;

  // Excel numeric date (e.g., 44444)
  if (typeof excelDate === 'number') {
    const parsed = XLSX.SSF.parse_date_code(excelDate);
    if (parsed) {
      const { y, m, d } = parsed;
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }

  const str = String(excelDate).trim();

  // Handle DD/MM/YYYY
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) {
    const [dd, mm, yyyy] = str.split('/');
    return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  }

  // Handle MM/DD/YYYY
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(str)) {
    const [part1, part2, year] = str.split('/');
    const d = parseInt(part1, 10);
    const m = parseInt(part2, 10);

    // If day > 12 → it's DD/MM/YYYY, else ambiguous
    if (d > 12) {
      return `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    } else {
      return `${year}-${String(d).padStart(2, '0')}-${String(m).padStart(2, '0')}`;
    }
  }

  // Attempt ISO date parsing
  const date = new Date(str);
  if (!isNaN(date.getTime())) {
    return date.toISOString().split('T')[0];
  }

  return null;
};

export const normalizeBankName = (bankName?: string): string | null => {
  if (!bankName) return null;
  const trimmed = bankName.trim();
  const matched = NIGERIAN_BANKS.find((b) => b.toLowerCase() === trimmed.toLowerCase());
  return matched || null;
};

export const parseExcelUsers = (buffer: Buffer): ParsedUser[] => {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  if (!rows.length || rows[0].length < 30) {
    throw new Error('Invalid Excel file: missing headers or insufficient columns.');
  }

  return rows
    .slice(1)
    .map((row) => {
      if (row.every((cell) => !cell)) return null;

      return {
        staffId: String(row[0] || '').trim(),
        title: String(row[1] || '').trim(),
        firstName: String(row[2] || '').trim(),
        middleName: String(row[3] || '').trim(),
        lastName: String(row[4] || '').trim(),
        gender: String(row[5] || '').toLowerCase(),
        dateOfBirth: getFormattedDate(row[6]),
        stateOfOrigin: String(row[7] || '').trim() || null,
        address: String(row[8] || '').trim(),
        city: String(row[9] || '').trim(),
        mobile: String(row[10] || '').trim(),
        email: String(row[11] || '').trim(),
        department: String(row[12] || '').trim(),
        position: String(row[13] || '').trim(),
        officeBranch: String(row[14] || '').trim(),
        employmentDate: getFormattedDate(row[15]),
        role: String(row[16] || '').toLowerCase(),
        accountInfo: {
          classLevel: String(row[17] || '').trim(),
          basicPay: Number(row[18] || 0),
          allowances: Number(row[19] || 0),
          bankAccountNumber: String(row[20] || '').trim(),
          // bankName: String(row[21] || '').trim(),
          bankName: row[21]?.trim() ? normalizeBankName(row[21]) : null,
          taxNumber: String(row[22] || '').trim(),
          pensionCompany: String(row[23] || '').trim() || null,
          pensionNumber: String(row[24] || '').trim(),
        },

        nextOfKin:
          row[25] || row[26] || row[27] || row[28]
            ? {
                name: String(row[25] || '').trim(),
                phone: String(row[26] || '').trim(),
                email: String(row[27] || '').trim(),
                relationship: String(row[28] || '').trim(),
              }
            : undefined,

        requirements: [],
        status: String(row[29] || 'active').toLowerCase(),
      };
    })
    .filter(Boolean) as ParsedUser[];
};

export const parseExcelPayroll = (buffer: Buffer): ParsedPayroll[] => {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawRows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  if (!rawRows.length) {
    throw new Error('Excel file is empty or missing data.');
  }

  const headerRowIndex = rawRows.findIndex((row) =>
    row.some((cell) => String(cell).trim().toLowerCase() === 'email'),
  );
  if (headerRowIndex === -1) {
    throw new Error("No valid header row found (missing 'email').");
  }

  const headers = rawRows[headerRowIndex].map((h) => String(h).trim());
  const dataRows = rawRows.slice(headerRowIndex + 1);

  return dataRows
    .map((row) => {
      if (!row || row.every((cell) => String(cell).trim() === '')) return null;

      const rowObj: Record<string, any> = {};
      headers.forEach((header, colIndex) => {
        rowObj[header] = typeof row[colIndex] === 'string' ? row[colIndex].trim() : row[colIndex];
      });

      if (!rowObj.email || !rowObj.month || !rowObj.year) return null;

      return {
        email: String(rowObj.email).trim(),
        month: String(rowObj.month).trim(),
        year: Number(rowObj.year) || 0,
        basicSalary: Number(rowObj.basicSalary) || 0,
        housingAllowance: Number(rowObj.housingAllowance) || 0,
        transportAllowance: Number(rowObj.transportAllowance) || 0,
        lasgAllowance: Number(rowObj.lasgAllowance) || 0,
        twentyFourHoursAllowance: Number(rowObj.twentyFourHoursAllowance) || 0,
        healthAllowance: Number(rowObj.healthAllowance) || 0,
        deductions: Number(rowObj.deductions) || 0,
      };
    })
    .filter(Boolean) as ParsedPayroll[];
};

export const recalcBreakdown = (gross: number) => {
  return {
    basicSalary: +(gross * 0.55).toFixed(2),
    housingAllowance: +(gross * 0.25).toFixed(2),
    transportAllowance: +(gross * 0.2).toFixed(2),
  };
};

export const parseExcelClassLevels = (buffer: Buffer): ParsedClassLevel[] => {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  if (!rows.length || rows[0].length < 4) {
    throw new Error('Invalid Excel file: missing headers or insufficient columns.');
  }

  return rows
    .slice(1)
    .map((row) => {
      if (row.length < 4) return null;
      return {
        year: Number(row[0] || 0),
        level: String(row[1] || '').trim(),
        payGrade: String(row[2] || '').trim(),
        grossSalary: Number(row[3] || 0),
      };
    })
    .filter(Boolean) as ParsedClassLevel[];
};

export const validateBankName = (bankName?: string): boolean => {
  if (!bankName) return true;
  const normalized = bankName.trim().toLowerCase();
  return NIGERIAN_BANKS.some((b) => b.toLowerCase() === normalized);
};
