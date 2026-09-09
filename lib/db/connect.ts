import mongoose from "mongoose";
import { getEnv } from "@/lib/env";

type MongooseCache = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

// Reuse the connection across hot-reloads in dev, and across serverless
// invocations that share a warm container in production.
declare global {
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

export class ReadOnlyDbNotConfiguredError extends Error {
  constructor() {
    super(
      "Read-only database setup is not complete (MONGODB_READONLY_URI is not configured). Please configure MONGODB_READONLY_URI in your environment or switch to Update mode."
    );
    this.name = "ReadOnlyDbNotConfiguredError";
  }
}

let readOnlyConn: mongoose.Connection | null = null;
let readOnlyPromise: Promise<mongoose.Connection> | null = null;

export async function connectReadOnlyDB(): Promise<mongoose.Connection> {
  const { MONGODB_READONLY_URI } = getEnv();
  if (!MONGODB_READONLY_URI) {
    throw new ReadOnlyDbNotConfiguredError();
  }

  if (readOnlyConn) return readOnlyConn;
  if (!readOnlyPromise) {
    readOnlyPromise = mongoose.createConnection(MONGODB_READONLY_URI, {
      bufferCommands: false,
    }).asPromise();
  }
  readOnlyConn = await readOnlyPromise;
  return readOnlyConn;
}
