"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const dotenv_1 = __importDefault(require("dotenv"));
const app_1 = __importDefault(require("./app"));
const redisClient_1 = require("./utils/redisClient");
const expireLeaves_1 = require("./jobs/expireLeaves");
const node_cron_1 = __importDefault(require("node-cron"));
const attendanceController_1 = require("./controllers/attendanceController");
const socket_io_1 = require("socket.io");
const http_1 = __importDefault(require("http"));
const user_model_1 = __importDefault(require("./models/user.model"));
const generatePayroll_1 = require("./jobs/generatePayroll");
const birthdayNotifications_1 = require("./utils/birthdayNotifications ");
dotenv_1.default.config();
const PORT = process.env.PORT || 8080;
mongoose_1.default
    .connect(process.env.MONGO_URI)
    .then(async () => {
    // Get existing indexes on the User collection
    const indexes = await user_model_1.default.collection.indexes();
    const biometryIndex = indexes.find((idx) => idx.key.biometryId === 1);
    // Drop the old biometryId index if it exists
    if (biometryIndex?.name) {
        await user_model_1.default.collection.dropIndex(biometryIndex.name);
    }
    else {
    }
    // Recreate a sparse unique index on biometryId
    await user_model_1.default.collection.createIndex({ biometryId: 1 }, { unique: true, sparse: true });
    // Create HTTP server from Express app
    const server = http_1.default.createServer(app_1.default);
    // Create Socket.IO server
    const io = new socket_io_1.Server(server, {
        cors: {
            origin: [
                'http://localhost:8083',
                'http://localhost:8082',
                'https://staging-hris.btmlimited.net',
            ],
            credentials: true,
        },
    });
    // Make io available globally so sendNotification helper can use it
    app_1.default.set('io', io);
    globalThis.io = io;
    io.on('connection', (socket) => {
        const userId = socket.handshake.query.userId;
        if (userId) {
            socket.join(userId);
        }
        socket.on('disconnect', () => {
        });
    });
    // ✅ Redis Test
    try {
        await redisClient_1.redisClient.set('ping', 'pong');
        const pong = await redisClient_1.redisClient.get('ping');
    }
    catch (err) {
    }
    // 🕒 Initial job
    await (0, expireLeaves_1.expireUnreviewedLeaves)();
    // 🕒 Scheduled jobs
    node_cron_1.default.schedule('0 0 * * *', async () => {
        await (0, expireLeaves_1.expireUnreviewedLeaves)();
    });
    node_cron_1.default.schedule('0 6 * * *', async () => {
        await (0, attendanceController_1.autoCheckoutForgotten)();
    });
    node_cron_1.default.schedule('0 18 * * *', async () => {
        await (0, attendanceController_1.autoCheckoutForgotten)();
    });
    node_cron_1.default.schedule("0 0 1 * *", async () => {
        await (0, generatePayroll_1.generateNextMonthPayroll)();
    });
    node_cron_1.default.schedule("0 0 1 * *", async () => {
        await (0, birthdayNotifications_1.sendBirthdayNotifications)(undefined, undefined, undefined);
    });
    server.listen(PORT, () => { });
})
    .catch((err) => { });
