import { NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/db/connect";
import { getCurrentUserId } from "@/lib/session";
import { ScheduledTask } from "@/lib/db/models/ScheduledTask";
import {
  updateRecurringGoogleEvent,
  deleteGoogleEvent,
  createRecurringGoogleEvent,
} from "@/lib/calendar/googleCalendarService";
import { formatRecurrenceLabel } from "@/lib/calendar/recurrence";

const updateScheduledTaskSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  startTime: z.string().regex(/^\d{1,2}:\d{2}$/).optional(),
  durationMinutes: z.number().min(5).max(1440).optional(),
  timezone: z.string().optional(),
  recurrenceRule: z.string().min(1).optional(),
  reminderMinutes: z.number().min(0).max(1440).optional(),
  syncToGoogleCalendar: z.boolean().optional(),
  enabled: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = updateScheduledTaskSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid update payload", details: parsed.error.issues }, { status: 400 });
  }

  await connectDB();
  const existing = await ScheduledTask.findOne({ _id: id, userId });
  if (!existing) {
    return NextResponse.json({ error: "Scheduled task not found", code: "NOT_FOUND" }, { status: 404 });
  }

  const updates: Record<string, unknown> = { ...parsed.data };

  if (parsed.data.recurrenceRule || parsed.data.startTime) {
    const rrule = parsed.data.recurrenceRule ?? existing.recurrenceRule;
    const time = parsed.data.startTime ?? existing.startTime;
    updates.recurrenceLabel = formatRecurrenceLabel(rrule, time);
  }

  // Google Calendar sync handling
  if (existing.googleEventId && parsed.data.syncToGoogleCalendar === false) {
    // User turned off sync - remove event from Google Calendar
    await deleteGoogleEvent(userId, existing.googleEventId);
    updates.googleEventId = null;
  } else if (!existing.googleEventId && parsed.data.syncToGoogleCalendar === true) {
    // User turned on sync - create event on Google Calendar
    const newEventId = await createRecurringGoogleEvent(userId, {
      title: parsed.data.title ?? existing.title,
      description: parsed.data.description ?? existing.description,
      startTime: parsed.data.startTime ?? existing.startTime,
      durationMinutes: parsed.data.durationMinutes ?? existing.durationMinutes,
      timezone: parsed.data.timezone ?? existing.timezone,
      recurrenceRule: parsed.data.recurrenceRule ?? existing.recurrenceRule,
      reminderMinutes: parsed.data.reminderMinutes ?? existing.reminderMinutes,
    });
    if (newEventId) updates.googleEventId = newEventId;
  } else if (existing.googleEventId) {
    // Update existing event on Google Calendar
    await updateRecurringGoogleEvent(userId, existing.googleEventId, {
      title: parsed.data.title,
      description: parsed.data.description,
      startTime: parsed.data.startTime,
      durationMinutes: parsed.data.durationMinutes,
      timezone: parsed.data.timezone,
      recurrenceRule: parsed.data.recurrenceRule,
      reminderMinutes: parsed.data.reminderMinutes,
    });
  }

  const updated = await ScheduledTask.findOneAndUpdate({ _id: id, userId }, { $set: updates }, { new: true }).lean();

  return NextResponse.json({ scheduledTask: updated });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });

  const { id } = await params;

  await connectDB();
  const existing = await ScheduledTask.findOne({ _id: id, userId });
  if (!existing) {
    return NextResponse.json({ error: "Scheduled task not found", code: "NOT_FOUND" }, { status: 404 });
  }

  if (existing.googleEventId) {
    await deleteGoogleEvent(userId, existing.googleEventId);
  }

  await ScheduledTask.deleteOne({ _id: id, userId });

  return NextResponse.json({ success: true });
}
