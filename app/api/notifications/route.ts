import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db/connect";
import { getCurrentUserId } from "@/lib/session";
import { Notification } from "@/lib/db/models/Notification";
import { ScheduledTask } from "@/lib/db/models/ScheduledTask";
import { doesRRuleOccurOnDate } from "@/lib/calendar/recurrence";

export async function GET(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });

  const url = new URL(req.url);
  const tzOffsetParam = url.searchParams.get("tzOffset");
  const tzOffsetMinutes = tzOffsetParam !== null && !isNaN(Number(tzOffsetParam))
    ? Number(tzOffsetParam)
    : new Date().getTimezoneOffset();

  await connectDB();

  // Compute client date string "YYYY-MM-DD"
  const nowUtcMs = Date.now();
  const clientLocalTimeMs = nowUtcMs - tzOffsetMinutes * 60 * 1000;
  const clientDate = new Date(clientLocalTimeMs);
  const dateStr = clientDate.toISOString().slice(0, 10);
  const currentMinutes = clientDate.getUTCHours() * 60 + clientDate.getUTCMinutes();

  // Fetch all enabled scheduled tasks
  const scheduledTasks = await ScheduledTask.find({ userId, enabled: true }).lean();

  for (const st of scheduledTasks) {
    const occursToday = doesRRuleOccurOnDate(
      st.recurrenceRule,
      clientDate,
      st.createdAt ? new Date(st.createdAt) : undefined
    );
    if (!occursToday) continue;

    const [startH, startM] = (st.startTime || "00:00").split(":").map(Number);
    const taskStartMins = (startH ?? 0) * 60 + (startM ?? 0);
    const reminderMins = st.reminderMinutes ?? 10;

    // Check if within reminder window, at start time, or already passed today
    if (currentMinutes >= taskStartMins - reminderMins) {
      const existing = await Notification.findOne({
        userId,
        date: dateStr,
        scheduledTaskId: st._id,
      });

      if (!existing) {
        await Notification.create({
          userId,
          scheduledTaskId: st._id,
          title: st.title,
          description: st.description || "",
          date: dateStr,
          startTime: st.startTime,
          durationMinutes: st.durationMinutes,
          status: "pending",
        });
      }
    }
  }

  // Fetch today's notifications + any recent pending notifications
  const notifications = await Notification.find({
    userId,
    $or: [{ date: dateStr }, { status: "pending" }],
  })
    .sort({ createdAt: -1 })
    .lean();

  return NextResponse.json({
    notifications: notifications.map((n) => ({
      id: String(n._id),
      scheduledTaskId: String(n.scheduledTaskId),
      title: n.title,
      description: n.description,
      date: n.date,
      startTime: n.startTime,
      durationMinutes: n.durationMinutes,
      status: n.status,
      timerSessionId: n.timerSessionId ? String(n.timerSessionId) : null,
      createdAt: n.createdAt,
    })),
  });
}
