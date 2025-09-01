"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const auth_routes_1 = __importDefault(require("./routes/auth.routes"));
const notificationRoutes_1 = __importDefault(require("./routes/notificationRoutes"));
const attendanceRoutes_1 = __importDefault(require("./routes/attendanceRoutes"));
const leaveRoutes_1 = __importDefault(require("./routes/leaveRoutes"));
const handoverRoutes_1 = __importDefault(require("./routes/handoverRoutes"));
const errorMiddleware_1 = require("./middleware/errorMiddleware");
const loanRoutes_1 = __importDefault(require("./routes/loanRoutes"));
const companySalaryStructureRoutes_1 = __importDefault(require("./routes/companySalaryStructureRoutes"));
const appraisalRoutes_1 = __importDefault(require("./routes/appraisalRoutes"));
const userRoutes_1 = __importDefault(require("./routes/userRoutes"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const reportRoutes_1 = __importDefault(require("./routes/reportRoutes"));
const departmentRoutes_1 = __importDefault(require("./routes/departmentRoutes"));
const classlevel_route_1 = __importDefault(require("./routes/classlevel.route"));
const contributions_routes_1 = __importDefault(require("./routes/contributions.routes"));
const payrollRoutes_1 = __importDefault(require("./routes/payrollRoutes"));
const training_routes_1 = __importDefault(require("./routes/training.routes"));
const app = (0, express_1.default)();
app.use(express_1.default.json());
app.use((0, cookie_parser_1.default)());
const allowedOrigins = ['http://localhost:8083', 'http://localhost:8082', 'http://staging-hris.btmlimited.net'];
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        }
        else {
            callback(new Error('Not allowed by CORS'), false);
        }
    },
    credentials: true,
}));
app.use('/api/auth', auth_routes_1.default);
app.use('/api/departments', departmentRoutes_1.default);
app.use('/api/levels', classlevel_route_1.default);
app.use('/api/cooperative', contributions_routes_1.default);
app.use('/api/user', userRoutes_1.default);
app.use('/api/attendance', attendanceRoutes_1.default);
app.use('/api/leaves', leaveRoutes_1.default);
app.use('/api/loans', loanRoutes_1.default);
app.use('/api/handover', handoverRoutes_1.default);
app.use('/api/appraisal', appraisalRoutes_1.default);
app.use('/api/payroll', payrollRoutes_1.default);
app.use('/api/salary', companySalaryStructureRoutes_1.default);
app.use('/api/notifications', notificationRoutes_1.default);
app.use('/api/reports', reportRoutes_1.default);
app.use('/api/training', training_routes_1.default);
// 🚨 Error Handling Middleware
app.use(errorMiddleware_1.ErrorMiddleware);
exports.default = app;
