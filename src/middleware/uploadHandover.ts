import multer, { FileFilterCallback } from 'multer';
import { Request } from 'express';

// Memory storage setup (storing files in memory for now)
const storage = multer.memoryStorage();

const uploadHandover = multer({
  storage,
  limits: { fileSize: 1 * 1024 * 1024 }, // 1MB limit
  fileFilter: (_req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
    // Accept multiple mime types (e.g., PDFs, images)
    const allowedMimes = [
      'application/pdf', // PDF
      'image/jpeg', // JPEG
      'image/png', // PNG
      'image/jpg', // JPG
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel', // .xls
      'text/csv', // .csv
    ];

    // Check if the uploaded file's mimetype is allowed
    if (!allowedMimes.includes(file.mimetype)) {
      cb(new Error('Only PDF, JPG, PNG files are allowed'));
    } else {
      cb(null, true); // Accept the file
    }
  },
});

export default uploadHandover;
