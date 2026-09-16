import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db/connect";
import { getCurrentUserId } from "@/lib/session";
import { Notification } from "@/lib/db/models/Notification";
import { TimerSession } from "@/lib/db/models/TimerSession";
import { ScheduledTask } from "@/lib/db/models/ScheduledTask";
import { emit } from "@/lib/realtime/emitter";
import { COUNTDOWN_SECONDS } from "@/lib/timers/constants";
import { objectIdString } from "@/lib/validation/schemas";
import { z } from "zod";

const actionSchema = z.object({
  action: z.enum(["approve", "reject", "start", "dismiss"]),
  slot: z.union([z.literal(1), z.literal(2)]).optional(),
});

export async function POST(req: Request, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });

  if (!objectIdString.safeParse(params.id).success) {
    return NextResponse.json({ error: "Invalid id", code: "VALIDATION_ERROR" }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid action", code: "VALIDATION_ERROR" }, { status: 400 });
  }

  const { action, slot } = parsed.data;

  await connectDB();

  const notif = await Notification.findOne({ _id: params.id, userId });
  if (!notif) {
    return NextResponse.json({ error: "Notification not found", code: "NOT_FOUND" }, { status: 404 });
  }

  const now = new Date();

  if (action === "approve") {
    // Directly count scheduled duration into today's / all-time usage
    const durationSeconds = notif.durationMinutes * 60;
    const session = await TimerSession.create({
      userId,
      scheduledTaskId: notif.scheduledTaskId,
      slot: 1,
      startedAt: now,
      actualEndedAt: now,
      plannedDurationSeconds: durationSeconds,
      contributedSeconds: durationSeconds,
      status: "completed",
    });

    notif.status = "approved";
    notif.timerSessionId = session._id as any;
    await notif.save();

    emit(userId, { type: "timer-changed" });
    emit(userId, { type: "notifications-updated" });

    return NextResponse.json({ ok: true, status: "approved" });
  }

  if (action === "reject") {
    // Mark as done / not followed with 0 tracked time
    const session = await TimerSession.create({
      userId,
      scheduledTaskId: notif.scheduledTaskId,
      slot: 1,
      startedAt: now,
      actualEndedAt: now,
      plannedDurationSeconds: notif.durationMinutes * 60,
      contributedSeconds: 0,
      status: "completed",
    });

    notif.status = "rejected";
    notif.timerSessionId = session._id as any;
    await notif.save();

    emit(userId, { type: "timer-changed" });
    emit(userId, { type: "notifications-updated" });

    return NextResponse.json({ ok: true, status: "rejected" });
  }

  if (action === "start") {
    const targetSlot = slot ?? 1;

    // Check if slot busy
    const slotBusy = await TimerSession.findOne({
      userId,
      slot: targetSlot,
      status: { $in: ["countdown", "running"] },
    });
    if (slotBusy) {
      return NextResponse.json(
        { error: `Timer slot ${targetSlot} is already in use`, code: "SLOT_BUSY" },
        { status: 409 }
      );
    }

    const session = await TimerSession.create({
      userId,
      scheduledTaskId: notif.scheduledTaskId,
      slot: targetSlot,
      startedAt: now,
      countdownEndsAt: new Date(now.getTime() + COUNTDOWN_SECONDS * 1000),
      plannedDurationSeconds: notif.durationMinutes * 60,
      status: "countdown",
    });

    notif.timerSessionId = session._id as any;
    await notif.save();

    emit(userId, { type: "timer-changed" });
    emit(userId, { type: "notifications-updated" });

    return NextResponse.json({ ok: true, session: { id: String(session._id) } });
  }

  if (action === "dismiss") {
    notif.status = "dismissed";
    await notif.save();
    emit(userId, { type: "notifications-updated" });

    return NextResponse.json({ ok: true, status: "dismissed" });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
