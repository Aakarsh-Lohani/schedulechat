import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db/connect";
import { getCurrentUserId } from "@/lib/session";
import { TimerSession } from "@/lib/db/models/TimerSession";
import { Task } from "@/lib/db/models/Task";
import { ScheduledTask } from "@/lib/db/models/ScheduledTask";

/**
 * Returns both timer slots' current session (if any) plus a derived "today total"
 * in seconds — completed sessions today + live elapsed time of any running session.
 * This is polled by the client on load and whenever a realtime event invalidates it.
 */
export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });

  await connectDB();

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const nowMs = Date.now();

  const [activeSessions, allCompletedSessions, activeTasks] = await Promise.all([
    TimerSession.find({ userId, status: { $in: ["countdown", "running", "paused"] } })
      .populate("taskId", "title defaultTimerMinutes scheduledTaskId")
      .populate("scheduledTaskId", "title durationMinutes")
      .lean(),
    TimerSession.find({ userId, status: "completed" })
      .select("contributedSeconds actualEndedAt startedAt taskId scheduledTaskId")
      .lean(),
    Task.find({ userId, status: { $ne: "archived" } }).select("_id").lean(),
  ]);

  const activeTaskIds = new Set(activeTasks.map((t) => String(t._id)));
  const validCompletedSessions = allCompletedSessions.filter(
    (s) => (s.taskId && activeTaskIds.has(String(s.taskId))) || (s.scheduledTaskId && (s.contributedSeconds ?? 0) > 0)
  );

  const slots: Record<1 | 2, unknown> = { 1: null, 2: null };
  for (const s of activeSessions) {
    const slotNum = s.slot as 1 | 2;
    const startedAtMs = new Date(s.startedAt).getTime();

    // Auto-expire zombie sessions older than 24 hours
    if (nowMs - startedAtMs > 24 * 60 * 60 * 1000) {
      const cappedDuration = s.plannedDurationSeconds + s.extendedBySeconds;
      await TimerSession.updateOne(
        { _id: s._id },
        {
          status: "completed",
          actualEndedAt: new Date(startedAtMs + cappedDuration * 1000),
          contributedSeconds: cappedDuration,
        }
      );
      continue;
    }

    const populatedTask = s.taskId as unknown as { _id: unknown; title?: string; scheduledTaskId?: unknown } | null;
    const populatedScheduledTask = s.scheduledTaskId as unknown as { _id: unknown; title?: string } | null;
    const taskTitle = populatedTask?.title ?? populatedScheduledTask?.title ?? "Scheduled Task";
    const isScheduledTask = Boolean(s.scheduledTaskId || populatedTask?.scheduledTaskId);

    slots[slotNum] = {
      id: String(s._id),
      taskId: String(populatedTask?._id ?? s.taskId ?? populatedScheduledTask?._id ?? s.scheduledTaskId ?? ""),
      taskTitle,
      isScheduledTask,
      status: s.status,
      startedAt: s.startedAt,
      countdownEndsAt: s.countdownEndsAt,
      plannedDurationSeconds: s.plannedDurationSeconds,
      extendedBySeconds: s.extendedBySeconds,
      pausedAt: s.pausedAt ? s.pausedAt.toISOString() : null,
      totalPausedSeconds: s.totalPausedSeconds ?? 0,
    };
  }

  let totalUsageSeconds = 0;
  let completedSecondsToday = 0;

  for (const s of validCompletedSessions) {
    const seconds = s.contributedSeconds ?? 0;
    totalUsageSeconds += seconds;

    const endedAt = s.actualEndedAt ? new Date(s.actualEndedAt).getTime() : 0;
    if (endedAt >= todayStart.getTime()) {
      const startedAt = s.startedAt ? new Date(s.startedAt).getTime() : endedAt;
      if (startedAt < todayStart.getTime()) {
        const secondsToday = Math.max(0, Math.floor((endedAt - todayStart.getTime()) / 1000));
        completedSecondsToday += Math.min(seconds, secondsToday);
      } else {
        completedSecondsToday += seconds;
      }
    }
  }

  // Cap today's completed seconds strictly to 24 hours (86,400s)
  completedSecondsToday = Math.min(86400, Math.max(0, completedSecondsToday));

  return NextResponse.json({
    slots,
    completedSecondsTodayBase: completedSecondsToday,
    totalUsageSeconds,
  });
}
