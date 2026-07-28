import mongoose from 'mongoose';
import { logInfo } from '../src/utils/logger.js';

let connectionPromise;

const connectDB = async () => {
  if (mongoose.connection.readyState === 1) return mongoose.connection;

  if (!connectionPromise) {
    connectionPromise = mongoose
      .connect(process.env.DB_URL, {
        serverSelectionTimeoutMS: 10000,
        dbName: process.env.DB_NAME || 'educationPlatform',
      })
      .then(() => {
        logInfo('database_connected', {
          database: mongoose.connection.name,
        });
        return mongoose.connection;
      })
      .catch((error) => {
        connectionPromise = undefined;
        throw error;
      });
  }

  return connectionPromise;
};

export default connectDB;
