import mongoose from "mongoose";
import { getEnv } from "@/lib/env";

type MongooseCache = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

// Reuse the connection across hot-reloads in dev, and across serverless
// invocations that share a warm container in production.
declare global {
  // eslint-disable-next-line no-var
  var __scheduleChatMongoose: MongooseCache | undefined;
}

const globalCache: MongooseCache = global.__scheduleChatMongoose ?? { conn: null, promise: null };
global.__scheduleChatMongoose = globalCache;

export async function connectDB(): Promise<typeof mongoose> {
  if (globalCache.conn) return globalCache.conn;

  if (!globalCache.promise) {
    const { MONGODB_URI } = getEnv();
    globalCache.promise = mongoose.connect(MONGODB_URI, {
      bufferCommands: false,
    });
  }

  globalCache.conn = await globalCache.promise;
  return globalCache.conn;
}
