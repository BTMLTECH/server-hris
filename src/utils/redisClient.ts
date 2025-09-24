import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

export const redisClient = new Redis(process.env.UPSTASH_REDIS_URL!, {
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

redisClient.on('connect', () => {});

redisClient.on('error', (err) => {});
