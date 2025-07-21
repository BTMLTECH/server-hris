import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

// Configure the Redis client with retry logic
export const redisClient = new Redis(process.env.UPSTASH_REDIS_URL!, {
  reconnectOnError: (err) => {
    // Customize reconnect logic if needed
    // For example, reconnect on ECONNRESET or any connection-related error
    if (err.message.includes('ECONNRESET')) {
      return true;
    }
    return false;
  },
  retryStrategy(times) {
    // Retry a max of 5 times, and gradually increase the time between attempts
    const delay = Math.min(times * 1000, 20000); // 1s, 2s, 3s, ..., 20s max delay
    return delay;
  },
  // Optional: Increase connection timeout if necessary
  connectTimeout: 10000, // 10 seconds
  // Optional: Max number of reconnect attempts
  maxRetriesPerRequest: 5,
});

redisClient.on('connect', () => {
});

redisClient.on('error', (err) => {
});
