import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db/connect";
import { getCurrentUserId } from "@/lib/session";
import { Task } from "@/lib/db/models/Task";
import { createTaskSchema } from "@/lib/validation/schemas";
import { emit } from "@/lib/realtime/emitter";
import { serializeTask } from "@/lib/api/serialize";

/**
 * GET /api/tasks
 * Query params:
 *   tabId=<id>            filter to one tab
 *   scheduledToday=true   filter to tasks scheduled for today (the virtual "Today's Tasks" view)
 *   from=<iso>&to=<iso>   filter by date-range overlap (used by the calendar view)
 */
export async function GET(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });

  const url = new URL(req.url);
  const tabId = url.searchParams.get("tabId");
  const scheduledToday = url.searchParams.get("scheduledToday") === "true";
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  await connectDB();

  // Clean up any stale materialized tasks from scheduled tasks so they never pollute Task boards
  await Task.deleteMany({
    userId,
    $or: [{ scheduledTaskId: { $ne: null } }, { title: { $regex: /^Daily Standup/i } }],
  });

  const query: Record<string, unknown> = {
    userId,
    status: { $ne: "archived" },
    scheduledTaskId: null,
  };
  if (tabId) {
    query.tabId = tabId;
  }
  if (scheduledToday) {
    const tzOffsetParam = url.searchParams.get("tzOffset");
    let startOfToday: Date;
    let endOfToday: Date;

    if (tzOffsetParam !== null && !isNaN(Number(tzOffsetParam))) {
      const tzOffsetMinutes = Number(tzOffsetParam);
      // Determine current instant in client's local day
      const nowUtcMs = Date.now();
      const clientLocalTimeMs = nowUtcMs - tzOffsetMinutes * 60 * 1000;
      const clientDate = new Date(clientLocalTimeMs);

      const year = clientDate.getUTCFullYear();
      const month = clientDate.getUTCMonth();
      const day = clientDate.getUTCDate();

      // Reconstruct start and end of client day in UTC
      startOfToday = new Date(Date.UTC(year, month, day) + tzOffsetMinutes * 60 * 1000);
      endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000 - 1);
    } else {
      startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      endOfToday = new Date(startOfToday);
      endOfToday.setHours(23, 59, 59, 999);
    }

    query.$or = [
      // 1. Any active task (under active section)
      { status: "in-progress" },
      // 2. Any task scheduled for today
      { scheduledDate: { $gte: startOfToday, $lte: endOfToday } },
      // 3. Any upcoming todo task that doesn't have a date assigned
      {
        status: "not-started",
        $or: [{ scheduledDate: null }, { scheduledDate: { $exists: false } }],
      },
      // 4. Tasks completed today
      {
        status: "done",
        $or: [
          { scheduledDate: { $gte: startOfToday, $lte: endOfToday } },
          { updatedAt: { $gte: startOfToday, $lte: endOfToday } },
        ],
      },
    ];
  }
  if (from && to) {
    const fromDate = new Date(from);
    const toDate = new Date(to);
    query.$or = [
      { scheduledDate: { $gte: fromDate, $lte: toDate } },
      { startDate: { $lte: toDate }, endDate: { $gte: fromDate } },
      { updatedAt: { $gte: fromDate, $lte: toDate }, status: "done" },
    ];
  }

  const tasks = await Task.find(query).sort({ order: 1 }).lean();
  return NextResponse.json({ tasks: tasks.map(serializeTask) });
}

export async function POST(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = createTaskSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request", code: "VALIDATION_ERROR" }, { status: 400 });

  await connectDB();
  const count = await Task.countDocuments({ userId, tabId: parsed.data.tabId });
  const task = await Task.create({
    userId,
    ...parsed.data,
    order: count,
  });

  emit(userId, { type: "task-updated" });

  return NextResponse.json({ task: serializeTask(task.toObject()) }, { status: 201 });
}

