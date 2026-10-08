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
  if (session.status !== "running" && session.status !== "countdown" && session.status !== "paused") {
    return NextResponse.json({ error: `Session is already ${session.status}`, code: "INVALID_STATE" }, { status: 409 });
  }

  const body = await req.json().catch(() => ({}));
  const isFollowed = body?.followed !== false && !body?.discardTime;
  const isAutoStopped = Boolean(body?.autoStopped);

  const now = new Date();
  let pausedDeduction = session.totalPausedSeconds ?? 0;
  if (session.status === "paused" && session.pausedAt) {
    pausedDeduction += Math.max(0, (now.getTime() - session.pausedAt.getTime()) / 1000);
  }

  const rawElapsedSeconds = (now.getTime() - session.startedAt.getTime()) / 1000;
  let isScheduledTask = Boolean(session.scheduledTaskId);
  if (!isScheduledTask && session.taskId) {
    const associatedTask = await Task.findById(session.taskId).select("scheduledTaskId").lean();
    if (associatedTask?.scheduledTaskId) {
      isScheduledTask = true;
    }
  }

  const elapsedWorkSeconds = Math.max(0, Math.round(rawElapsedSeconds - COUNTDOWN_SECONDS - pausedDeduction));
  const maxAllowedDuration = session.plannedDurationSeconds + session.extendedBySeconds;
  const calculatedContributed =
    session.status === "running" || session.status === "paused"
      ? (isScheduledTask ? Math.min(maxAllowedDuration, elapsedWorkSeconds) : elapsedWorkSeconds)
      : 0;
  const contributedSeconds = isFollowed ? calculatedContributed : 0;

  session.status = isFollowed ? "completed" : "cancelled";
  session.actualEndedAt = now;
  session.contributedSeconds = contributedSeconds;
  await session.save();

  if (contributedSeconds > 0 && session.taskId) {
    await Task.findOneAndUpdate({ _id: session.taskId, userId }, { $inc: { totalTrackedSeconds: contributedSeconds } });
  } else if (!isFollowed && session.taskId) {
    // If marked as not followed, revert task to not-started
    await Task.findOneAndUpdate({ _id: session.taskId, userId }, { $set: { status: "not-started" } });
  }

  // Sync with scheduled task notification for today
  if (session.scheduledTaskId) {
    const { Notification } = await import("@/lib/db/models/Notification");
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const matchingNotif = await Notification.findOne({
      userId,
      scheduledTaskId: session.scheduledTaskId,
      createdAt: { $gte: oneDayAgo },
    }).sort({ createdAt: -1 });

    if (matchingNotif) {
      if (!isFollowed) {
        // Discarded / not followed: mark notification rejected
        matchingNotif.status = "rejected";
        matchingNotif.timerSessionId = session._id as any;
      } else if (!isAutoStopped) {
        // Manually stopped by user: user was present and interacted, mark approved automatically
        matchingNotif.status = "approved";
        matchingNotif.timerSessionId = session._id as any;
      } else {
        // Auto-stopped: link session, leave pending so user can confirm if needed
        matchingNotif.timerSessionId = session._id as any;
      }
      await matchingNotif.save();
    }
    emit(userId, { type: "notifications-updated" });
  }

  emit(userId, { type: "timer-changed" });
  emit(userId, { type: "task-updated" });

  return NextResponse.json({ session: { id: String(session._id), status: session.status, contributedSeconds, followed: isFollowed } });
}
