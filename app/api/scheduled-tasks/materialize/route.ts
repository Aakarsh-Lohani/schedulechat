import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db/connect";
import { getCurrentUserId } from "@/lib/session";
import { ScheduledTask } from "@/lib/db/models/ScheduledTask";
import { Task } from "@/lib/db/models/Task";
import { Tab } from "@/lib/db/models/Tab";
import { doesRRuleOccurOnDate } from "@/lib/calendar/recurrence";
import { emit } from "@/lib/realtime/emitter";

/**
 * Idempotently materializes scheduled tasks into active Task cards in Today's Tasks
 * for any recurring series whose rule matches the given target date (default: today).
 */
export async function POST(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const tzOffsetMinutes = typeof body?.tzOffsetMinutes === "number" ? body.tzOffsetMinutes : new Date().getTimezoneOffset();

  await connectDB();

  // Compute client-relative today window
  const nowUtcMs = Date.now();
  const clientLocalTimeMs = nowUtcMs - tzOffsetMinutes * 60 * 1000;
  const clientDate = new Date(clientLocalTimeMs);

  const startOfToday = new Date(
    Date.UTC(clientDate.getUTCFullYear(), clientDate.getUTCMonth(), clientDate.getUTCDate()) +
      tzOffsetMinutes * 60 * 1000
  );
  const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000 - 1);

  // Fetch all enabled scheduled tasks for the user
  const scheduledTasks = await ScheduledTask.find({ userId, enabled: true }).lean();
  if (scheduledTasks.length === 0) {
    return NextResponse.json({ materializedCount: 0, tasks: [] });
  }

  // Get default tab
  const defaultTab = await Tab.findOne({ userId }).sort({ isSystemDefault: -1, order: 1 });
  if (!defaultTab) {
    return NextResponse.json({ error: "No tab found", code: "NO_TAB" }, { status: 400 });
  }

  const materializedTasks = [];

  for (const st of scheduledTasks) {
    const occursToday = doesRRuleOccurOnDate(
      st.recurrenceRule,
      clientDate,
      st.createdAt ? new Date(st.createdAt) : undefined
    );
    if (!occursToday) continue;

    // Check if task already exists for today by scheduledTaskId or matching title today
    const existing = await Task.findOne({
      userId,
      $or: [
        { scheduledTaskId: st._id, scheduledDate: { $gte: startOfToday, $lte: endOfToday } },
        { title: st.title, scheduledDate: { $gte: startOfToday, $lte: endOfToday } },
      ],
      status: { $ne: "archived" },
    });

    if (!existing) {
      const doc = await Task.create({
        userId,
        tabId: st.tabId || defaultTab._id,
        title: st.title,
        description: st.description || "",
        source: "manual",
        aiAccepted: true,
        status: "not-started",
        estimateMinutes: st.durationMinutes,
        defaultTimerMinutes: st.durationMinutes,
        scheduledDate: startOfToday,
        scheduledTaskId: st._id,
      });

      materializedTasks.push({
        id: String(doc._id),
        title: doc.title,
        estimateMinutes: doc.estimateMinutes,
        scheduledDate: doc.scheduledDate?.toISOString() ?? null,
      });
    }
  }

  if (materializedTasks.length > 0) {
    emit(userId, { type: "task-updated" });
  }

  return NextResponse.json({
    materializedCount: materializedTasks.length,
    tasks: materializedTasks,
  });
}
