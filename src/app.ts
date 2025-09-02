import express, { NextFunction, Request, Response } from "express";
import cors from 'cors';
import authRoutes from './routes/auth.routes';
import notificationRoutes from './routes/notificationRoutes';
import attendanceRoutes from './routes/attendanceRoutes';
import leaveRoutes from './routes/leaveRoutes';
import handoverRoutes from './routes/handoverRoutes';
import { ErrorMiddleware } from "./middleware/errorMiddleware";
import loanRoutes from "./routes/loanRoutes";
import payrollRoutes from "./routes/payrollRoutes";
import companySalaryStructureRoutes from "./routes/companySalaryStructureRoutes";
import appraisalRoutes from "./routes/appraisalRoutes";
import userRoutes from "./routes/userRoutes";
import cookieParser from 'cookie-parser';





const app = express();
app.use(express.json()); 
app.use(cookieParser());

const allowedOrigins = ['http://staging-hris.btmlimited.net'];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.indexOf(origin) !== -1) {
        // Allow requests with no origin (e.g., mobile apps or other sources)
        callback(null, true);
      } else {
        // Reject requests from unknown origins
        callback(new Error('Not allowed by CORS'), false);
      }
    },
    credentials: true, // If you're using sessions/cookies, set this to true.
  })
);


app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/leaves', leaveRoutes);
app.use('/api/loans', loanRoutes);
app.use('/api/handover', handoverRoutes);
app.use('/api/appraisal', appraisalRoutes);
app.use('/api/payroll', payrollRoutes);
app.use('/api/salary', companySalaryStructureRoutes);
app.use('/api/notifications', notificationRoutes);


app.all("*", (req: Request, res: Response, next: NextFunction) => {
  console.log(`Route not found: ${req.originalUrl}`);
  const error = new Error(`Route ${req.originalUrl} not found`) as any;
  error.statusCode = 404;
  next(error);
});


// 🚨 Error Handling Middleware
app.use(ErrorMiddleware);

export default app;
