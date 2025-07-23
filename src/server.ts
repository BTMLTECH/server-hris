// import mongoose from 'mongoose';
// import dotenv from 'dotenv';
// import app from './app';
// import { redisClient } from './utils/redisClient';
// import { expireUnreviewedLeaves } from './jobs/expireLeaves';
// import cron from 'node-cron';
// import { autoCheckoutForgotten } from './controllers/attendanceController';

// dotenv.config();
// const PORT = process.env.PORT || 8080;

// mongoose
//   .connect(process.env.MONGO_URI!)
//   .then(async () => {
//     console.log('✅ MongoDB Connected');

//     try {
//       await redisClient.set('ping', 'pong');
//       const pong = await redisClient.get('ping');
//       console.log(`✅ Redis ping: ${pong}`);
//     } catch (err) {
//       console.error('❌ Redis test failed:', err);
//     }

//     // 🕒 Run on startup (optional)
//     await expireUnreviewedLeaves();

//     // 🕒 Schedule to run every day at midnight
//     cron.schedule('0 0 * * *', async () => {
//       console.log('⏰ Running daily leave expiry check...');
//       await expireUnreviewedLeaves();
//     });

//         // 🕕 6:00 AM — Auto-checkout for *night* shift
//     cron.schedule('0 6 * * *', async () => {
//       console.log('⏰ Running 6AM cron for night shift auto-checkout...');
//       await autoCheckoutForgotten();
//     });

//     // 🕕 6:00 PM — Auto-checkout for *day* shift
//     cron.schedule('0 18 * * *', async () => {
//       console.log('⏰ Running 6PM cron for day shift auto-checkout...');
//       await autoCheckoutForgotten();
//     });


//     app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
//   })
//   .catch((err) => console.error('❌ MongoDB connection error:', err));

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import app from './app';
import { redisClient } from './utils/redisClient';
import { expireUnreviewedLeaves } from './jobs/expireLeaves';
import cron from 'node-cron';
import { autoCheckoutForgotten } from './controllers/attendanceController';
import User from './models/user.model';


dotenv.config();
const PORT = process.env.PORT || 8080;

mongoose
  .connect(process.env.MONGO_URI!)
  .then(async () => {
    console.log('✅ MongoDB Connected');

//     // ✅ Drop unique index on biometryId if it exists
//   const indexes = await User.collection.indexes();
// const biometryIndex = indexes.find((idx) => idx.key.biometryId === 1);

// if (biometryIndex?.name) {
//   await User.collection.dropIndex(biometryIndex.name);
//   console.log('✅ Dropped unique index on biometryId');
// } else {
//   console.log('ℹ️ No unique index found on biometryId');
// }

    // ✅ Redis Test
    try {
      await redisClient.set('ping', 'pong');
      const pong = await redisClient.get('ping');
      console.log(`✅ Redis ping: ${pong}`);
    } catch (err) {
      console.error('❌ Redis test failed:', err);
    }

    // 🕒 Initial job
    await expireUnreviewedLeaves();

    // 🕒 Scheduled jobs
    cron.schedule('0 0 * * *', async () => {
      console.log('⏰ Running daily leave expiry check...');
      await expireUnreviewedLeaves();
    });

    cron.schedule('0 6 * * *', async () => {
      console.log('⏰ Running 6AM cron for night shift auto-checkout...');
      await autoCheckoutForgotten();
    });

    cron.schedule('0 18 * * *', async () => {
      console.log('⏰ Running 6PM cron for day shift auto-checkout...');
      await autoCheckoutForgotten();
    });

    app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
  })
  .catch((err) => console.error('❌ MongoDB connection error:', err));
