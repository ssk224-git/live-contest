// Connects to MongoDB Atlas with Mongoose.
import mongoose from 'mongoose';
import { config } from './config.js';

// Connects once at start-up. Returns true when connected, false when MONGODB_URI is missing.
export async function connectDb(uri = config.mongoUri) {
  if (!uri) {
    console.warn('[db] MONGODB_URI is not set: saving quizzes and results will not work');
    return false;
  }
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 });
  console.log(`[db] connected to database "${mongoose.connection.name}"`);
  return true;
}

// True while the connection is open (used by /api/health).
export const dbConnected = () => mongoose.connection.readyState === 1;
