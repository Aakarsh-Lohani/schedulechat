import { NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/db/connect";
import { getCurrentUserId } from "@/lib/session";
import { ScheduledTask } from "@/lib/db/models/ScheduledTask";
import { createRecurringGoogleEvent } from "@/lib/calendar/googleCalendarService";
import { formatRecurrenceLabel } from "@/lib/calendar/recurrence";

const createScheduledTaskSchema = z.object({
  tabId: z.string().optional(),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  startTime: z.string().regex(/^\d{1,2}:\d{2}$/, "Format must be HH:mm"),
  durationMinutes: z.number().min(5).max(1440).default(30),
  timezone: z.string().default("Asia/Kolkata"),
  recurrenceRule: z.string().min(1),
  reminderMinutes: z.number().min(0).max(1440).default(10),
  syncToGoogleCalendar: z.boolean().default(true),
  enabled: z.boolean().default(true),
});

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });

  await connectDB();
  const tasks = await ScheduledTask.find({ userId }).sort({ createdAt: -1 }).lean();

  return NextResponse.json({
    scheduledTasks: tasks.map((t) => ({
      id: String(t._id),
      title: t.title,
      description: t.description,
      startTime: t.startTime,
      durationMinutes: t.durationMinutes,
      timezone: t.timezone,
      recurrenceRule: t.recurrenceRule,
      recurrenceLabel: t.recurrenceLabel || formatRecurrenceLabel(t.recurrenceRule, t.startTime),
      reminderMinutes: t.reminderMinutes,
      enabled: t.enabled,
      syncToGoogleCalendar: t.syncToGoogleCalendar,
      googleEventId: t.googleEventId,
      createdAt: t.createdAt.toISOString(),
    })),
  });
}

export async function POST(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = createScheduledTaskSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request payload", details: parsed.error.issues }, { status: 400 });
  }

  await connectDB();

  const recurrenceLabel = formatRecurrenceLabel(parsed.data.recurrenceRule, parsed.data.startTime);

  let googleEventId: string | null = null;
  if (parsed.data.syncToGoogleCalendar) {
    googleEventId = await createRecurringGoogleEvent(userId, {
      title: parsed.data.title,
      description: parsed.data.description,
      startTime: parsed.data.startTime,
      durationMinutes: parsed.data.durationMinutes,
      timezone: parsed.data.timezone,
      recurrenceRule: parsed.data.recurrenceRule,
      reminderMinutes: parsed.data.reminderMinutes,
    });
  }

  const doc = await ScheduledTask.create({
    userId,
    tabId: parsed.data.tabId,
    title: parsed.data.title,
    description: parsed.data.description ?? "",
    startTime: parsed.data.startTime,
    durationMinutes: parsed.data.durationMinutes,
    timezone: parsed.data.timezone,
    recurrenceRule: parsed.data.recurrenceRule,
    recurrenceLabel,
    reminderMinutes: parsed.data.reminderMinutes,
    syncToGoogleCalendar: parsed.data.syncToGoogleCalendar,
    googleEventId,
    enabled: parsed.data.enabled,
  });

  return NextResponse.json({
    scheduledTask: {
      id: String(doc._id),
      title: doc.title,
      description: doc.description,
      startTime: doc.startTime,
      durationMinutes: doc.durationMinutes,
      timezone: doc.timezone,
      recurrenceRule: doc.recurrenceRule,
      recurrenceLabel: doc.recurrenceLabel,
      reminderMinutes: doc.reminderMinutes,
      enabled: doc.enabled,
      syncToGoogleCalendar: doc.syncToGoogleCalendar,
      googleEventId: doc.googleEventId,
      createdAt: doc.createdAt.toISOString(),
    },
  });
}
