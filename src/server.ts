import mongoose from 'mongoose';
import dotenv from 'dotenv';
import app from './app';
import { redisClient } from './utils/redisClient';
import { expireUnreviewedLeaves } from './jobs/expireLeaves';
import cron from 'node-cron';
import { autoCheckoutForgotten } from './controllers/attendanceController';
import { Server, Server as SocketIOServer } from 'socket.io';
import http from 'http';
import { generateNextMonthPayroll } from './jobs/generatePayroll';
import { runBirthdayNotifications, seedMonthlyBirthdays } from './utils/birthdayNotifications ';
import Company from './models/Company';

dotenv.config();
const PORT = process.env.PORT || 8080;

mongoose
  .connect(process.env.MONGO_URI!)
  .then(async () => {
    const server = http.createServer(app);
    const io = new Server(server, {
      cors: {
        origin: [process.env.FRONTEND_URL!],
        credentials: true,
      },
    });

    // Make io globally available
    app.set('io', io);
    (globalThis as any).io = io;

    io.on('connection', (socket) => {
      const userId = socket.handshake.query.userId as string;
      if (userId) {
        socket.join(userId);
      }
      socket.on('disconnect', () => {
        socket.leave(userId);
      });
    });

    try {
      await redisClient.set('ping', 'pong');
      const pong = await redisClient.get('ping');
    } catch (err) {}

    await expireUnreviewedLeaves();

    cron.schedule('0 0 * * *', async () => {
      await expireUnreviewedLeaves();
    });

    cron.schedule('0 6 * * *', async () => {
      await autoCheckoutForgotten();
    });

    cron.schedule('0 18 * * *', async () => {
      await autoCheckoutForgotten();
    });

    cron.schedule(
      '0 0 10 * *',
      async () => {
        await generateNextMonthPayroll();
      },
      {
        timezone: 'Africa/Lagos',
      },
    );

    cron.schedule('0 1 * * *', async () => {
      const company = await Company.findOne({ status: 'active' });
      if (!company) return;

      await seedMonthlyBirthdays(company);
    });

    cron.schedule('0 8 * * *', async () => {
      const company = await Company.findOne({ status: 'active' });
      if (!company) {
        return;
      }
      await runBirthdayNotifications(company);
    });

    // Start server
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Error starting server:', err);
  });
