import { Task } from "@/lib/db/models/Task";
import { Tab } from "@/lib/db/models/Tab";
import { TimerSession } from "@/lib/db/models/TimerSession";
import { formatDuration } from "@/lib/timers/budget";

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * A tight, human-readable snapshot of the board — not the whole DB. Read tools
 * exist for the model to pull more detail on demand rather than force-feeding
 * everything every turn (see architecture/01-critical-components.md §F).
 */
export async function buildContextSnapshot(userId: string): Promise<string> {
  const [tabs, todaysTasks, activeSessions] = await Promise.all([
    Tab.find({ userId, status: "active" }).sort({ order: 1 }).lean(),
    Task.find({ userId, scheduledDate: { $gte: startOfToday() }, status: { $ne: "archived" } }).lean(),
    TimerSession.find({ userId, status: { $in: ["countdown", "running"] } })
      .populate("taskId", "title")
      .lean(),
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

  return [
    "## Current board snapshot",
    "",
    "### Tabs",
    tabLines,
    "",
    "### Today's tasks",
    taskLines,
    "",
    "### Timer slots",
    timerLines,
  ].join("\n");
}
