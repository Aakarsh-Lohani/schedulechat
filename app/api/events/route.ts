import mongoose, { Types } from "mongoose";
type MongoDocument = mongoose.mongo.BSON.Document;
import { getCurrentUserId } from "@/lib/session";
import { connectDB } from "@/lib/db/connect";
import { Task } from "@/lib/db/models/Task";
import { Tab } from "@/lib/db/models/Tab";
import { TimerSession } from "@/lib/db/models/TimerSession";
import { AIAction } from "@/lib/db/models/AIAction";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Extends how long the host keeps this connection open before forcibly closing it
// (Vercel serverless functions are killed after their max execution duration
// regardless of what's happening inside them — this only requests the longest
// duration your plan allows; Hobby plans cap this well below Pro/Enterprise).
// See https://vercel.com/docs/functions/configuring-functions/duration
export const maxDuration = 300;

const KEEPALIVE_MS = 20000;

// Maps a MongoDB collection name to the realtime event type the client expects.
// Built once at module load — collection names are available as soon as the
// models are defined, no DB connection needed yet.
const COLLECTION_TO_EVENT: Record<string, string> = {
  [Task.collection.name]: "task-updated",
  [Tab.collection.name]: "tabs-updated",
  [TimerSession.collection.name]: "timer-changed",
  [AIAction.collection.name]: "ai-action-executed",
};

/**
 * Real-time sync, backed by a MongoDB Change Stream opened for this exact
 * connection rather than an in-memory event emitter.
 *
 * WHY: on Vercel (and most serverless hosts), every API route is deployed as an
 * independent function instance with its own process memory. A write to
 * /api/tasks and a long-lived GET to /api/events are *never* the same process —
 * an in-memory pub/sub map shared via a Node `global` only works when everything
 * runs in one process, which is true in `next dev` (masking the problem locally)
 * but never true once deployed. Change Streams sidestep this entirely: each SSE
 * connection watches the actual database directly, which is real shared state
 * (Atlas), not process memory — so it works correctly regardless of which
 * function instance is running.
 */
export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) {
    return new Response("Unauthorized", { status: 401 });
  }

  const conn = await connectDB();
  const db = conn.connection.db;
  if (!db) {
    return new Response("Database unavailable", { status: 503 });
  }

  const userObjectId = new Types.ObjectId(userId);
  const encoder = new TextEncoder();

  let changeStream: ReturnType<typeof db.watch> | null = null;
  let keepAlive: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      changeStream = db.watch(
        [
          {
            $match: {
              "ns.coll": { $in: Object.keys(COLLECTION_TO_EVENT) },
              "fullDocument.userId": userObjectId,
            },
          },
        ],
        { fullDocument: "updateLookup" }
      );

      changeStream!.on("change", (change) => {
        const collName = "ns" in change && "coll" in change.ns ? change.ns.coll : undefined;
        const eventType = (collName && COLLECTION_TO_EVENT[collName]) || "task-updated";
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: eventType })}\n\n`));
        } catch {
          // controller already closed (client disconnected) — ignore
        }
      });

      changeStream!.on("error", () => {
        // Let the client's own reconnect-with-backoff logic handle this.
        try {
          controller.close();
        } catch {
          // already closed
        }
      });

      keepAlive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: keep-alive\n\n`));
        } catch {
          // already closed
        }
      }, KEEPALIVE_MS);
    },
    cancel() {
      changeStream?.close().catch(() => {});
      if (keepAlive) clearInterval(keepAlive);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}