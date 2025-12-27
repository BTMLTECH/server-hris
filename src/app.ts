import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.routes';
import notificationRoutes from './routes/notificationRoutes';
import attendanceRoutes from './routes/attendanceRoutes';
import leaveRoutes from './routes/leaveRoutes';
import handoverRoutes from './routes/handoverRoutes';
import { ErrorMiddleware } from './middleware/errorMiddleware';
import loanRoutes from './routes/loanRoutes';
import payrollRoutes from './routes/payrollRoutes';
import companySalaryStructureRoutes from './routes/companySalaryStructureRoutes';
import appraisalRoutes from './routes/appraisalRoutes';
import userRoutes from './routes/userRoutes';
import cookieParser from 'cookie-parser';
import reportRoutes from './routes/reportRoutes';
import departmentRoutes from './routes/departmentRoutes';
import classlevelRoutes from './routes/classlevel.route';
import contributionsRoutes from './routes/contributions.routes';
import trainingRoutes from './routes/training.routes';

const app = express();
app.use(express.json());
app.use(cookieParser());

const allowedOrigins = [
// 'http://localhost:8082',
  process.env.FRONTEND_URL!,
];
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) {
        return callback(null, true);
      }
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`Origin ${origin} not allowed by CORS`), false);
    },
    credentials: true,
  }),
);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/levels', classlevelRoutes);
app.use('/api/cooperative', contributionsRoutes);
app.use('/api/user', userRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/leaves', leaveRoutes);
app.use('/api/loans', loanRoutes);
app.use('/api/handover', handoverRoutes);
app.use('/api/appraisal', appraisalRoutes);
app.use('/api/payroll', payrollRoutes);
app.use('/api/salary', companySalaryStructureRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/training', trainingRoutes);

// 🚨 Error Handling Middleware
app.use(ErrorMiddleware);

export default app;
