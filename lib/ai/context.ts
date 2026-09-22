import { Task } from "@/lib/db/models/Task";
import { Tab } from "@/lib/db/models/Tab";
import { TimerSession } from "@/lib/db/models/TimerSession";
import { GoalContext } from "@/lib/db/models/GoalContext";
import { formatDuration } from "@/lib/timers/budget";

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * A tight, human-readable snapshot of the board and long-term goals context.
 * Injects user goals, study limits, sprint memory, current tasks, and timers.
 */
export async function buildContextSnapshot(userId: string): Promise<string> {
  const [tabs, todaysTasks, activeSessions, goalContext] = await Promise.all([
    Tab.find({ userId, status: "active" }).sort({ order: 1 }).lean(),
    Task.find({ userId, scheduledDate: { $gte: startOfToday() }, status: { $ne: "archived" } }).lean(),
    TimerSession.find({ userId, status: { $in: ["countdown", "running"] } })
      .populate("taskId", "title")
      .lean(),
    GoalContext.findOne({ userId }).lean(),
  ]);

  const tabLines = tabs.map((t) => `- ${t.name}`).join("\n") || "(none)";

  const taskLines =
    todaysTasks
      .map(
        (t) =>
          `- [${t.status}] "${t.title}" — tracked ${formatDuration(t.totalTrackedSeconds)} / est ${
            t.estimateMinutes
          }m, progress ${t.progressPercent}%${t.source === "ai-suggested" ? " (AI-suggested, pending accept)" : ""}`
      )
      .join("\n") || "(nothing scheduled for today yet)";

  const timerLines =
    activeSessions
      .map((s) => `- Slot ${s.slot}: ${s.status} on "${(s.taskId as unknown as { title?: string })?.title}"`)
      .join("\n") || "(both timer slots idle)";

  const now = new Date();
  const dateHeader = `Current date: ${now.toISOString().slice(0, 10)} (${now.toLocaleDateString("en-US", { weekday: "long" })})`;

  const goalSections = goalContext
    ? [
        "### Long-Term Goals & Study Limits",
        goalContext.userGoalsMarkdown || "(no custom goals set yet)",
        "",
        "### AI Sprint Memory & Log",
        goalContext.aiSprintLog || "(no sprint history yet)",
      ]
    : [
        "### Daily Study Limits & Constraints",
        "- Weekdays (Mon–Fri): Max 8 hours/day (480 minutes)",
        "- Weekends (Sat–Sun): Max 10 hours/day (600 minutes)",
      ];

  return [
    `## Current board snapshot (${dateHeader})`,
    "",
    "### Tabs",
    tabLines,
    "",
    "### Today's tasks",
    taskLines,
    "",
    "### Timer slots",
    timerLines,
    "",
    ...goalSections,
  ].join("\n");
}
