import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db/connect";
import { getCurrentUserId } from "@/lib/session";
import { TimerSession } from "@/lib/db/models/TimerSession";
import { Task } from "@/lib/db/models/Task";
import { Tab } from "@/lib/db/models/Tab";
import { computeOverlapSeconds, calculateOverrun } from "@/lib/analytics/metrics";

const DAY_MS = 24 * 60 * 60 * 1000;

export async function GET(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  const url = new URL(req.url);
  const tzOffsetParam = url.searchParams.get("tzOffset");
  const tzOffsetMinutes = tzOffsetParam !== null ? Number(tzOffsetParam) : new Date().getTimezoneOffset();

  await connectDB();

  // Compute timezone-aligned boundaries
  const nowUtcMs = Date.now();
  const clientLocalTimeMs = nowUtcMs - tzOffsetMinutes * 60 * 1000;
  const clientDate = new Date(clientLocalTimeMs);

  // 1. Today boundaries
  const startOfToday = new Date(
    Date.UTC(clientDate.getUTCFullYear(), clientDate.getUTCMonth(), clientDate.getUTCDate()) +
      tzOffsetMinutes * 60 * 1000
  );
  const endOfToday = new Date(startOfToday.getTime() + DAY_MS - 1);

  // 2. This Week boundaries (Monday 00:00 to Sunday 23:59:59)
  const currentDayOfWeek = clientDate.getUTCDay(); // 0 = Sun, 1 = Mon...
  const daysSinceMonday = currentDayOfWeek === 0 ? 6 : currentDayOfWeek - 1;
  const startOfWeek = new Date(startOfToday.getTime() - daysSinceMonday * DAY_MS);
  const endOfWeek = new Date(startOfWeek.getTime() + 7 * DAY_MS - 1);

  // 3. This Month boundaries (1st of current month to end of month)
  const startOfMonth = new Date(
    Date.UTC(clientDate.getUTCFullYear(), clientDate.getUTCMonth(), 1) + tzOffsetMinutes * 60 * 1000
  );
  const nextMonthStart = new Date(
    Date.UTC(clientDate.getUTCFullYear(), clientDate.getUTCMonth() + 1, 1) + tzOffsetMinutes * 60 * 1000
  );
  const endOfMonth = new Date(nextMonthStart.getTime() - 1);

  // Fetch all completed and running sessions
  const sessions = await TimerSession.find({
    userId,
    status: { $in: ["completed", "running"] },
  }).lean();

  // Fetch active tabs and filter out tasks from archived tabs or with archived status
  const activeTabs = await Tab.find({ userId, status: "active" }).lean();
  const activeTabIds = new Set(activeTabs.map((t) => String(t._id)));
  const tabNameMap = new Map(activeTabs.map((t) => [String(t._id), t.name]));

  const candidateTasks = await Task.find({
    userId,
    status: { $in: ["not-started", "in-progress", "done"] },
  }).lean();

  const tasks = candidateTasks.filter((t) => !t.tabId || activeTabIds.has(String(t.tabId)));
  const validTaskIds = new Set(tasks.map((t) => String(t._id)));
  // Filter sessions to only those associated with active tasks or scheduled tasks
  const validSessions = sessions.filter(
    (s) => validTaskIds.has(String(s.taskId)) || (Boolean(s.scheduledTaskId) && (s.contributedSeconds ?? 0) > 0)
  );

  let todaySeconds = 0;
  let thisWeekSeconds = 0;
  let thisMonthSeconds = 0;
  let allTimeSeconds = 0;

  for (const s of validSessions) {
    const started = new Date(s.startedAt);
    const ended = s.actualEndedAt
      ? new Date(s.actualEndedAt)
      : s.status === "completed"
      ? new Date(started.getTime() + (s.contributedSeconds || s.plannedDurationSeconds) * 1000)
      : null;
    const planned = s.plannedDurationSeconds;

    const tOverlap = computeOverlapSeconds(started, ended, planned, startOfToday, endOfToday);
    todaySeconds += tOverlap;

    const wOverlap = computeOverlapSeconds(started, ended, planned, startOfWeek, endOfWeek);
    thisWeekSeconds += wOverlap;

    const mOverlap = computeOverlapSeconds(started, ended, planned, startOfMonth, endOfMonth);
    thisMonthSeconds += mOverlap;

    if (s.status === "completed") {
      allTimeSeconds += s.contributedSeconds || planned;
    } else {
      // currently running live seconds
      const live = Math.max(0, Math.floor((Date.now() - started.getTime()) / 1000));
      allTimeSeconds += Math.min(planned, live);
    }
  }

  // Daily timeline generator for 7D, 14D, and 30D
  function generateDailyTimeline(numDays: number) {
    const points = [];
    for (let i = numDays - 1; i >= 0; i--) {
      const dayStart = new Date(startOfToday.getTime() - i * DAY_MS);
      const dayEnd = new Date(dayStart.getTime() + DAY_MS - 1);

      let dayActualSec = 0;
      for (const s of validSessions) {
        const started = new Date(s.startedAt);
        const ended = s.actualEndedAt
          ? new Date(s.actualEndedAt)
          : s.status === "completed"
          ? new Date(started.getTime() + (s.contributedSeconds || s.plannedDurationSeconds) * 1000)
          : null;
        dayActualSec += computeOverlapSeconds(started, ended, s.plannedDurationSeconds, dayStart, dayEnd);
      }

      // Planned time: tasks scheduled for that day
      let dayPlannedSec = 0;
      for (const t of tasks) {
        if (t.scheduledDate) {
          const schedTime = new Date(t.scheduledDate).getTime();
          if (schedTime >= dayStart.getTime() && schedTime <= dayEnd.getTime()) {
            dayPlannedSec += t.estimateMinutes * 60;
          }
        }
      }

      const dayDate = new Date(dayStart.getTime() - tzOffsetMinutes * 60 * 1000);
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const label = `${monthNames[dayDate.getUTCMonth()]} ${dayDate.getUTCDate()}`;

      points.push({
        date: dayStart.toISOString().split("T")[0],
        label,
        actualHours: Number((dayActualSec / 3600).toFixed(2)),
        plannedHours: Number((dayPlannedSec / 3600).toFixed(2)),
        actualMinutes: Math.round(dayActualSec / 60),
        plannedMinutes: Math.round(dayPlannedSec / 60),
      });
    }
    return points;
  }

  const timeline7d = generateDailyTimeline(7);
  const timeline14d = generateDailyTimeline(14);
  const timeline30d = generateDailyTimeline(30);

  // Overrun tasks analysis: tasks where tracked time exceeded estimate
  const overrunTasks = [];
  for (const t of tasks) {
    const trackedSec = t.totalTrackedSeconds || 0;
    const { isOverrun, overrunMinutes, percentOfEstimate } = calculateOverrun(t.estimateMinutes, trackedSec);

    if (trackedSec > 0) {
      overrunTasks.push({
        id: String(t._id),
        title: t.title,
        tabName: tabNameMap.get(String(t.tabId)) || "General",
        status: t.status,
        progressPercent: t.progressPercent,
        estimateMinutes: t.estimateMinutes,
        trackedMinutes: Math.round(trackedSec / 60),
        overrunMinutes,
        isOverrun,
        percentOfEstimate,
      });
    }
  }

  // Sort overrun tasks by overrunMinutes descending
  overrunTasks.sort((a, b) => b.overrunMinutes - a.overrunMinutes);

  // Tab distribution
  const tabDistributionMap = new Map<string, number>();
  for (const t of tasks) {
    const tabName = tabNameMap.get(String(t.tabId)) || "General";
    const currentSec = tabDistributionMap.get(tabName) || 0;
    tabDistributionMap.set(tabName, currentSec + (t.totalTrackedSeconds || 0));
  }

  const tabDistribution = Array.from(tabDistributionMap.entries()).map(([name, seconds]) => ({
    name,
    hours: Number((seconds / 3600).toFixed(1)),
    minutes: Math.round(seconds / 60),
  }));

  // Label distribution
  const labelMap = new Map<string, number>();
  for (const t of tasks) {
    const sec = t.totalTrackedSeconds || 0;
    const taskLabels = Array.isArray(t.labels) && t.labels.length > 0 ? t.labels : ["Unlabeled"];
    for (const lbl of taskLabels) {
      labelMap.set(lbl, (labelMap.get(lbl) || 0) + sec);
    }
  }

  const labelDistribution = Array.from(labelMap.entries())
    .map(([name, seconds]) => ({
      name,
      hours: Number((seconds / 3600).toFixed(1)),
      minutes: Math.round(seconds / 60),
    }))
    .sort((a, b) => b.minutes - a.minutes);

  // Hourly activity (0-23) based on session start times aligned to client timezone
  const hourlyActivity = Array.from({ length: 24 }, (_, h) => {
    const ampm = h === 0 ? "12 AM" : h < 12 ? `${h} AM` : h === 12 ? "12 PM" : `${h - 12} PM`;
    return {
      hour: h,
      label: ampm,
      minutes: 0,
      sessionCount: 0,
    };
  });

  for (const s of validSessions) {
    const started = new Date(s.startedAt);
    const localStart = new Date(started.getTime() - tzOffsetMinutes * 60 * 1000);
    const hour = localStart.getUTCHours();
    const durSec =
      s.status === "completed"
        ? s.contributedSeconds || s.plannedDurationSeconds
        : Math.min(s.plannedDurationSeconds, Math.floor((Date.now() - started.getTime()) / 1000));
    if (hourlyActivity[hour]) {
      hourlyActivity[hour].minutes += Math.round(durSec / 60);
      hourlyActivity[hour].sessionCount += 1;
    }
  }

  // All Tasks overview
  const allTasks = tasks.map((t) => {
    const trackedSec = t.totalTrackedSeconds || 0;
    const { isOverrun, overrunMinutes, percentOfEstimate } = calculateOverrun(t.estimateMinutes, trackedSec);
    return {
      id: String(t._id),
      title: t.title,
      tabName: tabNameMap.get(String(t.tabId)) || "General",
      status: t.status,
      progressPercent: t.progressPercent,
      estimateMinutes: t.estimateMinutes,
      trackedMinutes: Math.round(trackedSec / 60),
      overrunMinutes,
      isOverrun,
      percentOfEstimate,
      labels: Array.isArray(t.labels) ? t.labels : [],
    };
  });

  const activeTasksCount = tasks.filter((t) => t.status === "in-progress").length;
  const completedTasksCount = tasks.filter((t) => t.status === "done").length;
  const upcomingTasksCount = tasks.filter((t) => t.status === "not-started").length;

  return NextResponse.json({
    metrics: {
      todaySeconds,
      thisWeekSeconds,
      thisMonthSeconds,
      allTimeSeconds,
      activeTasksCount,
      completedTasksCount,
      upcomingTasksCount,
      totalTasksCount: tasks.length,
    },
    timelines: {
      "7d": timeline7d,
      "14d": timeline14d,
      "30d": timeline30d,
    },
    overrunTasks: overrunTasks.slice(0, 10),
    allTasks,
    tabDistribution,
    labelDistribution,
    hourlyActivity,
    updatedAt: new Date().toISOString(),
  });
}
