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
  const query: Record<string, unknown> = { userId, status: { $ne: "archived" } };
  if (tabId) query.tabId = tabId;
  if (scheduledToday) {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(startOfToday);
    endOfToday.setHours(23, 59, 59, 999);
    query.$or = [
      { scheduledDate: { $gte: startOfToday, $lte: endOfToday } },
      { startDate: { $lte: endOfToday }, endDate: { $gte: startOfToday } },
    ];
  }
  if (from && to) {
    query.$or = [
      { scheduledDate: { $gte: new Date(from), $lte: new Date(to) } },
      { startDate: { $lte: new Date(to) }, endDate: { $gte: new Date(from) } },
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

