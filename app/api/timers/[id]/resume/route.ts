import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db/connect";
import { getCurrentUserId } from "@/lib/session";
import { TimerSession } from "@/lib/db/models/TimerSession";
import { objectIdString } from "@/lib/validation/schemas";
import { emit } from "@/lib/realtime/emitter";

/**
 * POST /api/timers/[id]/resume
 * Resumes a paused timer session. Accumulates the paused duration into
 * totalPausedSeconds and clears pausedAt.
 */
export async function POST(_req: Request, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  if (!objectIdString.safeParse(params.id).success) {
    return NextResponse.json({ error: "Invalid id", code: "VALIDATION_ERROR" }, { status: 400 });
  }

  await connectDB();
  const session = await TimerSession.findOne({ _id: params.id, userId });
  if (!session) return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
  if (session.status !== "paused") {
    return NextResponse.json({ error: `Cannot resume a ${session.status} session`, code: "INVALID_STATE" }, { status: 409 });
  }

  // Accumulate paused duration
  if (session.pausedAt) {
    const pausedDuration = Math.max(0, Math.round((Date.now() - session.pausedAt.getTime()) / 1000));
    session.totalPausedSeconds = (session.totalPausedSeconds ?? 0) + pausedDuration;
  }

  session.status = "running";
  session.pausedAt = null;
  await session.save();

  emit(userId, { type: "timer-changed" });

  return NextResponse.json({ session: { id: String(session._id), status: "running" } });
}
