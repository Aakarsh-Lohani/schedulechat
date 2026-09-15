import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db/connect";
import { getCurrentUserId } from "@/lib/session";
import { TimerSession } from "@/lib/db/models/TimerSession";
import { Task } from "@/lib/db/models/Task";
import { objectIdString } from "@/lib/validation/schemas";
import { emit } from "@/lib/realtime/emitter";
import { COUNTDOWN_SECONDS } from "@/lib/timers/constants";

export async function POST(req: Request, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  if (!objectIdString.safeParse(params.id).success) {
    return NextResponse.json({ error: "Invalid id", code: "VALIDATION_ERROR" }, { status: 400 });
  }

  await connectDB();
  const session = await TimerSession.findOne({ _id: params.id, userId });
  if (!session) return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
  if (session.status !== "running" && session.status !== "countdown") {
    return NextResponse.json({ error: `Session is already ${session.status}`, code: "INVALID_STATE" }, { status: 409 });
  }

  const body = await req.json().catch(() => ({}));
  const isFollowed = body?.followed !== false && !body?.discardTime;

  const now = new Date();
  const rawElapsedSeconds = (now.getTime() - session.startedAt.getTime()) / 1000;
  const calculatedContributed = session.status === "running" ? Math.max(0, Math.round(rawElapsedSeconds - COUNTDOWN_SECONDS)) : 0;
  const contributedSeconds = isFollowed ? calculatedContributed : 0;

  session.status = isFollowed ? "completed" : "cancelled";
  session.actualEndedAt = now;
  session.contributedSeconds = contributedSeconds;
  await session.save();

  if (contributedSeconds > 0) {
    await Task.findOneAndUpdate({ _id: session.taskId, userId }, { $inc: { totalTrackedSeconds: contributedSeconds } });
  } else if (!isFollowed) {
    // If marked as not followed, revert task to not-started
    await Task.findOneAndUpdate({ _id: session.taskId, userId }, { $set: { status: "not-started" } });
  }

  emit(userId, { type: "timer-changed" });
  emit(userId, { type: "task-updated" });

  return NextResponse.json({ session: { id: String(session._id), status: session.status, contributedSeconds, followed: isFollowed } });
}
