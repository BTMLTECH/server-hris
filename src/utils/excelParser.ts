"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseExcelClassLevels = exports.recalcBreakdown = exports.parseExcelPayroll = exports.parseExcelUsers = void 0;
const XLSX = __importStar(require("xlsx"));
const getFormattedDate = (excelDate) => {
    if (typeof excelDate === "number") {
        const parsed = XLSX.SSF.parse_date_code(excelDate);
        if (parsed) {
            const { y, m, d } = parsed;
            return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        }
    }
    const parsedDate = new Date(String(excelDate).trim());
    if (!isNaN(parsedDate.getTime())) {
        return parsedDate.toISOString().split("T")[0];
    }
    return String(excelDate).trim();
};
const parseExcelUsers = (buffer) => {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    if (!rows.length || rows[0].length < 30) {
        throw new Error("Invalid Excel file: missing headers or insufficient columns.");
    }
    const users = rows
        .slice(1)
        .map((row) => {
        if (row.every((cell) => !cell))
            return null;
        return {
            staffId: String(row[0] || "").trim(),
            title: String(row[1] || "").trim(),
            firstName: String(row[2] || "").trim(),
            middleName: String(row[3] || "").trim(),
            lastName: String(row[4] || "").trim(),
            gender: String(row[5] || "").toLowerCase(),
            dateOfBirth: getFormattedDate(row[6]),
            stateOfOrigin: String(row[7] || "").trim(),
            address: String(row[8] || "").trim(),
            city: String(row[9] || "").trim(),
            mobile: String(row[10] || "").trim(),
            email: String(row[11] || "").trim(),
            department: String(row[12] || "").trim(),
            position: String(row[13] || "").trim(),
            officeBranch: String(row[14] || "").trim(),
            employmentDate: getFormattedDate(row[15]),
            role: String(row[16] || "").toLowerCase(),
            accountInfo: {
                classLevel: String(row[17] || "").trim(),
                basicPay: Number(row[18] || 0),
                allowances: Number(row[19] || 0),
                bankAccountNumber: String(row[20] || "").trim(),
                bankName: String(row[21] || "").trim(),
                taxNumber: String(row[22] || "").trim(),
                pensionCompany: String(row[23] || "").trim(),
                pensionNumber: String(row[24] || "").trim(),
            },
            nextOfKin: {
                name: String(row[25] || "").trim(),
                phone: String(row[26] || "").trim(),
                email: String(row[27] || "").trim(),
                relationship: String(row[28] || "").trim(),
            },
            requirements: [], // will be filled after onboarding
            status: String(row[29] || "active").toLowerCase(),
        };
    })
        .filter(Boolean);
    return users;
};
exports.parseExcelUsers = parseExcelUsers;
const parseExcelPayroll = (buffer) => {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
    if (!rawRows.length) {
        throw new Error("Excel file is empty or missing data.");
    }
    // Find the header row index
    const headerRowIndex = rawRows.findIndex((row) => row.some((cell) => String(cell).trim().toLowerCase() === "email"));
    if (headerRowIndex === -1) {
        throw new Error("No valid header row found (missing 'email').");
    }
    // Extract and clean header names
    const headers = rawRows[headerRowIndex].map((h) => String(h).trim());
    // Get only data rows after header row
    const dataRows = rawRows.slice(headerRowIndex + 1);
    // Convert rows to objects
    const payrollData = dataRows
        .map((row) => {
        if (!row || row.every((cell) => String(cell).trim() === "")) {
            return null; // Skip completely empty rows
        }
        const rowObj = {};
        headers.forEach((header, colIndex) => {
            rowObj[header] = typeof row[colIndex] === "string"
                ? row[colIndex].trim()
                : row[colIndex];
        });
        if (!rowObj.email || !rowObj.month || !rowObj.year) {
            return null; // Skip incomplete rows
        }
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
        .filter(Boolean);
    return payrollData;
};
exports.parseExcelPayroll = parseExcelPayroll;
const recalcBreakdown = (gross) => {
    return {
        basicSalary: +(gross * 0.55).toFixed(2),
        housingAllowance: +(gross * 0.25).toFixed(2),
        transportAllowance: +(gross * 0.20).toFixed(2),
    };
};
exports.recalcBreakdown = recalcBreakdown;
const parseExcelClassLevels = (buffer) => {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    if (!rows.length || rows[0].length < 4) {
        throw new Error("Invalid Excel file: missing headers or insufficient columns.");
    }
    const classLevels = rows.slice(1).map((row) => {
        if (row.length < 4)
            return null;
        return {
            year: Number(row[0] || 0),
            level: String(row[1] || "").trim(),
            payGrade: String(row[2] || "").trim(),
            grossSalary: Number(row[3] || 0),
        };
    }).filter(Boolean);
    return classLevels;
};
exports.parseExcelClassLevels = parseExcelClassLevels;
