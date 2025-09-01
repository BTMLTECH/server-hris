"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const multer_1 = __importDefault(require("multer"));
// Memory storage setup (storing files in memory for now)
const storage = multer_1.default.memoryStorage();
const uploadHandover = (0, multer_1.default)({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        // Accept multiple mime types (e.g., PDFs, images)
        const allowedMimes = [
            'application/pdf', // PDF
            'image/jpeg', // JPEG
            'image/png', // PNG
            'image/jpg', // JPG
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
            'application/vnd.ms-excel', // .xls
            'text/csv' // .csv
        ];
        // Check if the uploaded file's mimetype is allowed
        if (!allowedMimes.includes(file.mimetype)) {
            cb(new Error('Only PDF, JPG, PNG files are allowed'));
        }
        else {
            cb(null, true); // Accept the file
        }
    },
});
exports.default = uploadHandover;
