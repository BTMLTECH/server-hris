import mongoose from "mongoose";
import dotenv from "dotenv";
import app from "./app";
import { redisClient } from "./utils/redisClient";
import { expireUnreviewedLeaves } from "./jobs/expireLeaves";
import cron from "node-cron";
import { autoCheckoutForgotten } from "./controllers/attendanceController";
import { Server, Server as SocketIOServer } from "socket.io";
import http from "http";
import { generateNextMonthPayroll } from "./jobs/generatePayroll";
import { runBirthdayNotifications } from "./utils/birthdayNotifications ";
import Company from "./models/Company";


dotenv.config();
const PORT = process.env.PORT || 8080;

mongoose
  .connect(process.env.MONGO_URI!)
  .then(async () => {
    

    // 🔹 Ensure unique sparse index for biometryId
    // const indexes = await User.collection.indexes();
    // const biometryIndex = indexes.find((idx) => idx.key.biometryId === 1);
    // if (biometryIndex?.name) {
    //   await User.collection.dropIndex(biometryIndex.name);
    // }
    // await User.collection.createIndex(
    //   { biometryId: 1 },
    //   { unique: true, sparse: true }
    // );

    // 🔹 Create HTTP + Socket.IO server
    const server = http.createServer(app);
    const io = new Server(server, {
      cors: {
        origin: [
          // "http://localhost:8083",
          // "http://localhost:8082",
          "http://staging-hris.btmlimited.net",
        ],
        credentials: true,
      },
    });

    // Make io globally available
    app.set("io", io);
    (globalThis as any).io = io;

    io.on("connection", (socket) => {
      const userId = socket.handshake.query.userId as string;
      if (userId) {
        socket.join(userId);
      }
      socket.on("disconnect", () => {
      });
    });

    // 🔹 Redis connection test
    try {
      await redisClient.set("ping", "pong");
      const pong = await redisClient.get("ping");
    } catch (err) {
    }

    // 🔹 Initial jobs
    await expireUnreviewedLeaves();

    // 🔹 Scheduled jobs
    cron.schedule("0 0 * * *", async () => {
      await expireUnreviewedLeaves();
    });

    cron.schedule("0 6 * * *", async () => {
      await autoCheckoutForgotten();
    });

    cron.schedule("0 18 * * *", async () => {
      await autoCheckoutForgotten();
    });

    cron.schedule("0 0 1 * *", async () => {
      await generateNextMonthPayroll();
    });

   cron.schedule("0 0 1 * *", async () => {   
        
        const company = await Company.findOne({ status: "active" });
        if (!company) {
          return;
        }

        await runBirthdayNotifications(company);

      });

    // Start server
    server.listen(PORT, () =>{}   
    );
  })
  .catch((err) => {});
