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
  action: z.enum(["approve", "reject", "start", "dismiss", "cancel"]),
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
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const dayStart = new Date(`${notif.date}T00:00:00.000Z`);
  const dayEnd = new Date(`${notif.date}T23:59:59.999Z`);

  // Helper to find any existing timer session linked to this notification or scheduled task for this day
  async function findLinkedSession() {
    if (notif?.timerSessionId) {
      const sess = await TimerSession.findOne({ _id: notif.timerSessionId, userId });
      if (sess) return sess;
    }
    return await TimerSession.findOne({
      userId,
      scheduledTaskId: notif?.scheduledTaskId,
      $or: [
        { startedAt: { $gte: dayStart, $lte: dayEnd } },
        { startedAt: { $gte: oneDayAgo, $lte: now } },
      ],
    }).sort({ startedAt: -1 });
  }

  if (action === "approve") {
    const durationSeconds = notif.durationMinutes * 60;
    const existingSession = await findLinkedSession();

    if (existingSession) {
      // Session already ran or was running; ensure completed and credit seconds
      existingSession.status = "completed";
      existingSession.actualEndedAt = existingSession.actualEndedAt || now;
      if (!existingSession.contributedSeconds || existingSession.contributedSeconds === 0) {
        existingSession.contributedSeconds = durationSeconds;
      }
      await existingSession.save();

      notif.status = "approved";
      notif.timerSessionId = existingSession._id as any;
      await notif.save();
    } else {
      // User completed routine in real life without running a timer: create exactly 1 completed session
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
    }

    emit(userId, { type: "timer-changed" });
    emit(userId, { type: "notifications-updated" });

    return NextResponse.json({ ok: true, status: "approved" });
  }

  if (action === "reject") {
    // User did not follow: zero out time on existing session if any
    const existingSession = await findLinkedSession();
    if (existingSession) {
      existingSession.contributedSeconds = 0;
      existingSession.status = "cancelled";
      existingSession.actualEndedAt = existingSession.actualEndedAt || now;
      await existingSession.save();
    }

    notif.status = "rejected";
    await notif.save();

    emit(userId, { type: "timer-changed" });
    emit(userId, { type: "notifications-updated" });

    return NextResponse.json({ ok: true, status: "rejected" });
  }

  if (action === "cancel") {
    // Cancel event for today
    const existingSession = await findLinkedSession();
    if (existingSession) {
      existingSession.contributedSeconds = 0;
      existingSession.status = "cancelled";
      existingSession.actualEndedAt = existingSession.actualEndedAt || now;
      await existingSession.save();
    }

    notif.status = "cancelled";
    await notif.save();

    emit(userId, { type: "timer-changed" });
    emit(userId, { type: "notifications-updated" });

    return NextResponse.json({ ok: true, status: "cancelled" });
  }

  if (action === "start") {
    // Idempotency: check if already running
    const existingActive = await TimerSession.findOne({
      userId,
      scheduledTaskId: notif.scheduledTaskId,
      status: { $in: ["countdown", "running", "paused"] },
    });
    if (existingActive) {
      notif.timerSessionId = existingActive._id as any;
      await notif.save();
      return NextResponse.json({ ok: true, session: { id: String(existingActive._id) } });
    }

    let targetSlot: 1 | 2 = slot ?? 1;
    let slotBusy = await TimerSession.findOne({
      userId,
      slot: targetSlot,
      status: { $in: ["countdown", "running", "paused"] },
    });

    if (slotBusy) {
      const altSlot: 1 | 2 = targetSlot === 1 ? 2 : 1;
      const altBusy = await TimerSession.findOne({
        userId,
        slot: altSlot,
        status: { $in: ["countdown", "running", "paused"] },
      });
      if (!altBusy) {
        targetSlot = altSlot;
        slotBusy = null;
      }
    }

    if (slotBusy) {
      return NextResponse.json(
        { error: "Both timer slots are currently in use", code: "SLOT_BUSY" },
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
