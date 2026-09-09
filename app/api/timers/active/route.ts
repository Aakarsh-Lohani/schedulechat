import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db/connect";
import { getCurrentUserId } from "@/lib/session";
import { TimerSession } from "@/lib/db/models/TimerSession";

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

  const [activeSessions, allCompletedSessions] = await Promise.all([
    TimerSession.find({ userId, status: { $in: ["countdown", "running"] } })
      .populate("taskId", "title defaultTimerMinutes")
      .lean(),
    TimerSession.find({ userId, status: "completed" })
      .select("contributedSeconds actualEndedAt startedAt")
      .lean(),
  ]);

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

    const populatedTask = s.taskId as unknown as { _id: unknown; title?: string } | null;
    slots[slotNum] = {
      id: String(s._id),
      taskId: String(populatedTask?._id ?? s.taskId),
      taskTitle: populatedTask?.title ?? "Task",
      status: s.status,
      startedAt: s.startedAt,
      countdownEndsAt: s.countdownEndsAt,
      plannedDurationSeconds: s.plannedDurationSeconds,
      extendedBySeconds: s.extendedBySeconds,
    };
  }

  let totalUsageSeconds = 0;
  let completedSecondsToday = 0;

  for (const s of allCompletedSessions) {
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
