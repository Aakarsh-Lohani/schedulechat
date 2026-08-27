import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db/connect";
import { getCurrentUserId } from "@/lib/session";
import { Task } from "@/lib/db/models/Task";
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
  const { taskId, slot } = parsed.data;

  await connectDB();

  const task = await Task.findOne({ _id: taskId, userId });
  if (!task) return NextResponse.json({ error: "Task not found", code: "NOT_FOUND" }, { status: 404 });

  const slotBusy = await TimerSession.findOne({ userId, slot, status: { $in: ["countdown", "running"] } });
  if (slotBusy) {
    return NextResponse.json({ error: `Timer slot ${slot} is already in use`, code: "SLOT_BUSY" }, { status: 409 });
  }

  const taskActiveElsewhere = await TimerSession.findOne({
    userId,
    taskId,
    status: { $in: ["countdown", "running"] },
  });
  if (taskActiveElsewhere) {
    return NextResponse.json(
      { error: "This task already has an active timer in the other slot", code: "TASK_ALREADY_ACTIVE" },
      { status: 409 }
    );
  }

  const now = new Date();
  const session = await TimerSession.create({
    userId,
    taskId,
    slot,
    startedAt: now,
    countdownEndsAt: new Date(now.getTime() + COUNTDOWN_SECONDS * 1000),
    plannedDurationSeconds: task.defaultTimerMinutes * 60,
    status: "countdown",
  });

  emit(userId, { type: "timer-changed" });

  return NextResponse.json({ session: serializeSession(session.toObject()) }, { status: 201 });
}

