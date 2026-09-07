import { Types } from "mongoose";
import { getCurrentUserId } from "@/lib/session";
import { connectDB } from "@/lib/db/connect";
import { Task } from "@/lib/db/models/Task";
import { Tab } from "@/lib/db/models/Tab";
import { TimerSession } from "@/lib/db/models/TimerSession";
import { AIAction } from "@/lib/db/models/AIAction";
import { subscribe, type RealtimeEvent, type RealtimeEventType } from "@/lib/realtime/emitter";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const KEEPALIVE_MS = 15000;

const COLLECTION_TO_EVENT: Record<string, string> = {
  [Task.collection.name]: "task-updated",
  [Tab.collection.name]: "tabs-updated",
  [TimerSession.collection.name]: "timer-changed",
  [AIAction.collection.name]: "ai-action-executed",
};

export async function GET(req: Request) {
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
  let unsubscribeEmitter: (() => void) | null = null;
  let isClosed = false;

  const stream = new ReadableStream({
    start(controller) {
      const cleanup = () => {
        if (isClosed) return;
        isClosed = true;
        if (keepAlive) {
          clearInterval(keepAlive);
          keepAlive = null;
        }
        if (unsubscribeEmitter) {
          unsubscribeEmitter();
          unsubscribeEmitter = null;
        }
        if (changeStream) {
          changeStream.close().catch(() => {});
          changeStream = null;
        }
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      const sendEvent = (event: RealtimeEvent) => {
        if (isClosed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          cleanup();
        }
      };

      // 1. Subscribe to in-memory emitter (catches deletes, fast in-process writes, and standalone Mongo fallback)
      unsubscribeEmitter = subscribe(userId, (event) => {
        sendEvent(event);
      });

      // 2. Open MongoDB ChangeStream if replica set supports it
      try {
        changeStream = db.watch(
          [
            {
              $match: {
                "ns.coll": { $in: Object.keys(COLLECTION_TO_EVENT) },
                $or: [
                  { "fullDocument.userId": userObjectId },
                  { operationType: "delete" },
                ],
              },
            },
          ],
          { fullDocument: "updateLookup" }
        );

        changeStream.on("change", (change) => {
          const collName = "ns" in change && "coll" in change.ns ? change.ns.coll : undefined;
          const eventType = (collName && COLLECTION_TO_EVENT[collName]) || "task-updated";
          sendEvent({ type: eventType as RealtimeEventType });
        });

        changeStream.on("error", () => {
          if (changeStream) {
            changeStream.close().catch(() => {});
            changeStream = null;
          }
        });
      } catch {
        // Standalone Mongo environment: ChangeStreams unavailable, fallback to emitter continues
      }

      // 3. Keep-alive comments
      keepAlive = setInterval(() => {
        if (isClosed) return;
        try {
          controller.enqueue(encoder.encode(`: keep-alive\n\n`));
        } catch {
          cleanup();
        }
      }, KEEPALIVE_MS);

      // 4. Abort signal listener for client disconnects
      req.signal.addEventListener("abort", cleanup);
    },
    cancel() {
      if (keepAlive) clearInterval(keepAlive);
      if (unsubscribeEmitter) unsubscribeEmitter();
      changeStream?.close().catch(() => {});
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform, no-store, must-revalidate",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}