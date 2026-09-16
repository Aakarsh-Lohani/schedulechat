import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db/connect";
import { getCurrentUserId } from "@/lib/session";
import { Task } from "@/lib/db/models/Task";
import { ScheduledTask } from "@/lib/db/models/ScheduledTask";
import { TimerSession } from "@/lib/db/models/TimerSession";
import { startTimerSchema } from "@/lib/validation/schemas";
import { emit } from "@/lib/realtime/emitter";
import { COUNTDOWN_SECONDS } from "@/lib/timers/constants";
import { serializeSession } from "@/lib/api/serialize";

export async function POST(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = startTimerSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request", code: "VALIDATION_ERROR" }, { status: 400 });
  const { taskId, scheduledTaskId, slot } = parsed.data;

  await connectDB();

  let plannedDurationSeconds = 30 * 60;
  let task = null;
  let scheduledTask = null;

  if (taskId) {
    task = await Task.findOne({ _id: taskId, userId });
    if (!task) return NextResponse.json({ error: "Task not found", code: "NOT_FOUND" }, { status: 404 });
    plannedDurationSeconds = task.defaultTimerMinutes * 60;
  } else if (scheduledTaskId) {
    scheduledTask = await ScheduledTask.findOne({ _id: scheduledTaskId, userId });
    if (!scheduledTask) return NextResponse.json({ error: "Scheduled task not found", code: "NOT_FOUND" }, { status: 404 });
    plannedDurationSeconds = scheduledTask.durationMinutes * 60;
  }

  const slotBusy = await TimerSession.findOne({ userId, slot, status: { $in: ["countdown", "running"] } });
  if (slotBusy) {
    return NextResponse.json({ error: `Timer slot ${slot} is already in use`, code: "SLOT_BUSY" }, { status: 409 });
  }

  const taskActiveFilter = taskId
    ? { userId, taskId, status: { $in: ["countdown", "running"] } }
    : { userId, scheduledTaskId, status: { $in: ["countdown", "running"] } };

  const taskActiveElsewhere = await TimerSession.findOne(taskActiveFilter);
  if (taskActiveElsewhere) {
    return NextResponse.json(
      { error: "This task already has an active timer in the other slot", code: "TASK_ALREADY_ACTIVE" },
      { status: 409 }
    );
  }

  const now = new Date();
  const session = await TimerSession.create({
    userId,
    taskId: taskId ?? null,
    scheduledTaskId: scheduledTaskId ?? null,
    slot,
    startedAt: now,
    countdownEndsAt: new Date(now.getTime() + COUNTDOWN_SECONDS * 1000),
    plannedDurationSeconds,
    status: "countdown",
  });

  // Automatically update regular task status to active (in-progress) when timer starts
  if (task && task.status === "not-started") {
    task.status = "in-progress";
    await task.save();
    emit(userId, { type: "task-updated" });
  }

  emit(userId, { type: "timer-changed" });

  return NextResponse.json({ session: serializeSession(session.toObject()) }, { status: 201 });
}

