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

  const [activeSessions, todaysCompleted] = await Promise.all([
    TimerSession.find({ userId, status: { $in: ["countdown", "running"] } })
      .populate("taskId", "title defaultTimerMinutes")
      .lean(),
    TimerSession.find({
      userId,
      status: "completed",
      actualEndedAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
    }).lean(),
  ]);

  const slots: Record<1 | 2, unknown> = { 1: null, 2: null };
  for (const s of activeSessions) {
    const slotNum = s.slot as 1 | 2;
    slots[slotNum] = {
      id: String(s._id),
      taskId: String((s.taskId as any)?._id ?? s.taskId),
      taskTitle: (s.taskId as any)?.title ?? "Task",
      status: s.status,
      startedAt: s.startedAt,
      countdownEndsAt: s.countdownEndsAt,
      plannedDurationSeconds: s.plannedDurationSeconds,
      extendedBySeconds: s.extendedBySeconds,
    };
  }

  const completedSecondsToday = todaysCompleted.reduce((sum, s) => sum + (s.contributedSeconds ?? 0), 0);

  return NextResponse.json({ slots, completedSecondsTodayBase: completedSecondsToday });
}
