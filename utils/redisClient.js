"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.redisClient = void 0;
const ioredis_1 = __importDefault(require("ioredis"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
exports.redisClient = new ioredis_1.default(process.env.UPSTASH_REDIS_URL, {
    reconnectOnError: (err) => {
        if (err.message.includes('ECONNRESET')) {
            return true;
        }
        return false;
    },
    retryStrategy(times) {
        const delay = Math.min(times * 1000, 20000);
        return delay;
    },
    connectTimeout: 10000,
    maxRetriesPerRequest: 5,
});
exports.redisClient.on('connect', () => {
});
exports.redisClient.on('error', (err) => {
});
