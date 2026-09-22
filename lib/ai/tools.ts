import { z } from "zod";
import { Types } from "mongoose";
import { Task } from "@/lib/db/models/Task";
import { Tab } from "@/lib/db/models/Tab";
import { TimerSession } from "@/lib/db/models/TimerSession";
import { ScheduledTask } from "@/lib/db/models/ScheduledTask";
import { GoalContext } from "@/lib/db/models/GoalContext";
import { buildRRule, formatRecurrenceLabel } from "@/lib/calendar/recurrence";
import type Anthropic from "@anthropic-ai/sdk";

/** A proposal is what a `propose*` tool returns — never a direct DB write. */
export interface ToolProposal {
  actionType:
    | "create-task"
    | "create-tasks-batch"
    | "update-task"
    | "move-task"
    | "set-schedule"
    | "create-tab"
    | "archive-task"
    | "create-scheduled-task"
    | "delete-scheduled-task"
    | "update-sprint-log";
  summary: string;
  proposedPayload: Record<string, unknown>;
  beforeSnapshot: Record<string, unknown> | null;
}

interface ReadToolDef<TInput> {
  kind: "read";
  description: string;
  inputSchema: Anthropic.Tool.InputSchema;
  zodSchema: z.ZodType<TInput>;
  handler: (userId: string, input: TInput) => Promise<unknown>;
}

interface ProposeToolDef<TInput> {
  kind: "propose";
  description: string;
  inputSchema: Anthropic.Tool.InputSchema;
  zodSchema: z.ZodType<TInput>;
  handler: (userId: string, input: TInput) => Promise<ToolProposal>;
}

// A tool registry inherently holds heterogeneous input types per entry (each tool's
// Zod schema and handler are mutually consistent, but different from every other
// tool's) — `any` here is the correct escape hatch, not a type-safety gap; every
// individual TOOLS[name] entry above is still fully and correctly typed.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ToolDef = ReadToolDef<any> | ProposeToolDef<any>;

async function resolveTabId(userId: string, tabIdOrName: string): Promise<string> {
  if (Types.ObjectId.isValid(tabIdOrName)) return tabIdOrName;
  // Escape regex special characters to prevent injection from LLM-supplied tab names
  const escaped = tabIdOrName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const tab = await Tab.findOne({ userId, name: new RegExp(`^${escaped}$`, "i"), status: "active" });
  if (!tab) throw new Error(`No tab named "${tabIdOrName}" found.`);
  return String(tab._id);
}

function startOfToday(tzOffsetMinutes?: number): Date {
  if (tzOffsetMinutes !== undefined && !isNaN(tzOffsetMinutes)) {
    const nowUtcMs = Date.now();
    const clientLocalTimeMs = nowUtcMs - tzOffsetMinutes * 60 * 1000;
    const clientDate = new Date(clientLocalTimeMs);
    return new Date(Date.UTC(clientDate.getUTCFullYear(), clientDate.getUTCMonth(), clientDate.getUTCDate()) + tzOffsetMinutes * 60 * 1000);
  }
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfToday(tzOffsetMinutes?: number): Date {
  const start = startOfToday(tzOffsetMinutes);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
}

// ---- Read tools ----

const getTasksSchema = z.object({
  tabName: z.string().optional(),
  scheduledToday: z.boolean().optional(),
  tzOffset: z.number().optional(),
});

const getTimeSummarySchema = z.object({});

const getActiveTimersSchema = z.object({});

const getTabsSchema = z.object({});

const getUnfinishedTasksSchema = z.object({
  daysBack: z.number().min(1).max(30).default(7),
  tzOffset: z.number().optional(),
});

const getScheduledTasksSchema = z.object({
  enabledOnly: z.boolean().default(true),
});

const getDailyWorkloadSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD format").optional(),
  days: z.number().min(1).max(14).default(7),
  tzOffset: z.number().optional(),
});

const getGoalContextSchema = z.object({});

// ---- Propose (write) tools ----

const proposeCreateTaskSchema = z.object({
  tabName: z.string(),
  title: z.string(),
  estimateMinutes: z.number().min(1).max(24 * 60).default(30),
  defaultTimerMinutes: z.number().min(1).max(240).default(30),
  scheduleForToday: z.boolean().default(false),
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD format").optional(),
  tzOffset: z.number().optional(),
});

const proposeCreateTasksBatchSchema = z.object({
  batchTitle: z.string().default("Weekly Sprint Tasks"),
  tasks: z
    .array(
      z.object({
        tabName: z.string(),
        title: z.string(),
        estimateMinutes: z.number().min(1).max(24 * 60).default(60),
        defaultTimerMinutes: z.number().min(1).max(240).default(30),
        scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD format").optional(),
        description: z.string().optional(),
      })
    )
    .min(1)
    .max(30),
  sprintAssumptions: z.string().optional(),
  tzOffset: z.number().optional(),
});

const proposeUpdateSprintLogSchema = z.object({
  sprintNotes: z.string(),
  assumptions: z.string().optional(),
});

const proposeUpdateTaskSchema = z.object({
  taskId: z.string(),
  title: z.string().optional(),
  estimateMinutes: z.number().min(1).max(24 * 60).optional(),
  progressPercent: z.number().min(0).max(100).optional(),
  status: z.enum(["not-started", "in-progress", "done", "archived"]).optional(),
});

const proposeMoveTaskSchema = z.object({
  taskId: z.string(),
  toTabName: z.string(),
});

const proposeSetScheduleSchema = z.object({
  taskId: z.string(),
  scheduleForToday: z.boolean(),
  tzOffset: z.number().optional(),
});

const proposeCreateTabSchema = z.object({
  name: z.string(),
});

const proposeArchiveTaskSchema = z.object({
  taskId: z.string(),
});

const proposeCreateScheduledTaskSchema = z.object({
  title: z.string(),
  startTime: z.string().regex(/^\d{1,2}:\d{2}$/, "HH:mm format (e.g. 19:00, 08:30)"),
  durationMinutes: z.number().min(5).max(1440).default(30),
  recurrenceType: z.enum(["daily", "weekdays", "weekly", "biweekly", "custom"]).default("daily"),
  daysOfWeek: z.array(z.number().min(0).max(6)).optional(),
  intervalWeeks: z.number().optional(),
  reminderMinutes: z.number().default(10),
  description: z.string().optional(),
});

const proposeDeleteScheduledTaskSchema = z.object({
  scheduledTaskId: z.string(),
});

export const TOOLS: Record<string, ToolDef> = {
  getTasks: {
    kind: "read",
    description:
      "List tasks, optionally filtered by tab name or by whether they're scheduled for today. Use this before proposing changes so you're working from real data.",
    inputSchema: {
      type: "object",
      properties: {
        tabName: { type: "string", description: "Filter to a specific tab, e.g. 'DSA'" },
        scheduledToday: { type: "boolean", description: "If true, only tasks scheduled for today" },
        tzOffset: { type: "number", description: "Client timezone offset in minutes" },
      },
    },
    zodSchema: getTasksSchema,
    handler: async (userId, input) => {
      const query: Record<string, unknown> = { userId, status: { $ne: "archived" } };
      if (input.tabName) query.tabId = await resolveTabId(userId, input.tabName);
      if (input.scheduledToday) {
        query.scheduledDate = {
          $gte: startOfToday(input.tzOffset),
          $lte: endOfToday(input.tzOffset),
        };
      }
      const tasks = await Task.find(query).limit(50).lean();
      return tasks.map((t) => ({
        id: String(t._id),
        title: t.title,
        status: t.status,
        estimateMinutes: t.estimateMinutes,
        totalTrackedSeconds: t.totalTrackedSeconds,
        progressPercent: t.progressPercent,
        scheduledDate: t.scheduledDate,
        source: t.source,
      }));
    },
  },

  getTabs: {
    kind: "read",
    description: "List all active tabs (categories) the user has.",
    inputSchema: { type: "object", properties: {} },
    zodSchema: getTabsSchema,
    handler: async (userId) => {
      const tabs = await Tab.find({ userId, status: "active" }).sort({ order: 1 }).lean();
      return tabs.map((t) => ({ id: String(t._id), name: t.name }));
    },
  },

  getActiveTimers: {
    kind: "read",
    description: "Get the current state of both timer slots (which task, if any, is running or counting down).",
    inputSchema: { type: "object", properties: {} },
    zodSchema: getActiveTimersSchema,
    handler: async (userId) => {
      const sessions = await TimerSession.find({
        userId,
        status: { $in: ["countdown", "running"] },
      })
        .populate("taskId", "title")
        .lean();
      return sessions.map((s) => ({
        slot: s.slot,
        status: s.status,
        task: (s.taskId as unknown as { title?: string })?.title ?? "unknown",
        startedAt: s.startedAt,
        plannedDurationSeconds: s.plannedDurationSeconds,
      }));
    },
  },

  getTimeSummary: {
    kind: "read",
    description: "Get total tracked time today, grouped by tab, to answer questions like 'where did my time go today'.",
    inputSchema: { type: "object", properties: {} },
    zodSchema: getTimeSummarySchema,
    handler: async (userId) => {
      const tasks = await Task.find({ userId, status: { $ne: "archived" } }).populate("tabId", "name").lean();
      const byTab: Record<string, number> = {};
      for (const t of tasks) {
        const tabName = (t.tabId as unknown as { name?: string })?.name ?? "Unfiled";
        byTab[tabName] = (byTab[tabName] ?? 0) + (t.totalTrackedSeconds ?? 0);
      }
      return byTab;
    },
  },

  getUnfinishedTasks: {
    kind: "read",
    description:
      "Query incomplete/leftover tasks from the past N days (default 7 days) that are not done or archived. Useful for rolling unfinished tasks into the new sprint.",
    inputSchema: {
      type: "object",
      properties: {
        daysBack: { type: "number", description: "Number of days back to inspect, default 7" },
        tzOffset: { type: "number", description: "Client timezone offset in minutes" },
      },
    },
    zodSchema: getUnfinishedTasksSchema,
    handler: async (userId, input) => {
      const days = input.daysBack ?? 7;
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const tasks = await Task.find({
        userId,
        status: { $in: ["not-started", "in-progress"] },
        $or: [
          { scheduledDate: { $gte: cutoff, $lte: new Date() } },
          { scheduledDate: null, createdAt: { $gte: cutoff } },
        ],
      })
        .populate("tabId", "name")
        .limit(30)
        .lean();

      return tasks.map((t) => ({
        id: String(t._id),
        title: t.title,
        tab: (t.tabId as unknown as { name?: string })?.name ?? "General",
        status: t.status,
        estimateMinutes: t.estimateMinutes,
        totalTrackedSeconds: t.totalTrackedSeconds,
        progressPercent: t.progressPercent,
        scheduledDate: t.scheduledDate ? t.scheduledDate.toISOString().slice(0, 10) : null,
      }));
    },
  },

  getScheduledTasks: {
    kind: "read",
    description:
      "List recurring routines, habit blocks, and scheduled meeting series (e.g. daily standup, LeetCode contests, exercise). Use this to avoid scheduling sprint tasks that conflict with existing routines.",
    inputSchema: {
      type: "object",
      properties: {
        enabledOnly: { type: "boolean", description: "If true, only return active recurring routines (default true)" },
      },
    },
    zodSchema: getScheduledTasksSchema,
    handler: async (userId, input) => {
      const query: Record<string, unknown> = { userId };
      if (input.enabledOnly ?? true) query.enabled = true;
      const tasks = await ScheduledTask.find(query).sort({ startTime: 1 }).lean();
      return tasks.map((t) => ({
        id: String(t._id),
        title: t.title,
        startTime: t.startTime,
        durationMinutes: t.durationMinutes,
        recurrenceRule: t.recurrenceRule,
        recurrenceLabel: t.recurrenceLabel || formatRecurrenceLabel(t.recurrenceRule, t.startTime),
        reminderMinutes: t.reminderMinutes,
        enabled: t.enabled,
      }));
    },
  },

  getDailyWorkload: {
    kind: "read",
    description:
      "Get scheduled task minutes and workload per date across upcoming days (default 7 days) to verify adherence to daily study limits (max 8h weekdays, 10h weekends).",
    inputSchema: {
      type: "object",
      properties: {
        startDate: { type: "string", description: "Start date in YYYY-MM-DD format (defaults to today)" },
        days: { type: "number", description: "Number of days to check, default 7" },
        tzOffset: { type: "number", description: "Client timezone offset in minutes" },
      },
    },
    zodSchema: getDailyWorkloadSchema,
    handler: async (userId, input) => {
      const numDays = input.days ?? 7;
      let start: Date;
      if (input.startDate) {
        start = new Date(input.startDate + "T00:00:00.000Z");
      } else {
        start = startOfToday(input.tzOffset);
      }
      const end = new Date(start.getTime() + numDays * 24 * 60 * 60 * 1000);

      const tasks = await Task.find({
        userId,
        status: { $ne: "archived" },
        scheduledDate: { $gte: start, $lt: end },
      }).lean();

      // Aggregate by YYYY-MM-DD
      const dayMap: Record<string, { minutes: number; count: number; titles: string[] }> = {};
      for (let i = 0; i < numDays; i++) {
        const d = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
        const key = d.toISOString().slice(0, 10);
        dayMap[key] = { minutes: 0, count: 0, titles: [] };
      }

      for (const t of tasks) {
        if (!t.scheduledDate) continue;
        const key = t.scheduledDate.toISOString().slice(0, 10);
        if (dayMap[key]) {
          dayMap[key].minutes += t.estimateMinutes || 30;
          dayMap[key].count += 1;
          dayMap[key].titles.push(t.title);
        }
      }

      return Object.entries(dayMap).map(([dateStr, data]) => {
        const dateObj = new Date(dateStr + "T00:00:00.000Z");
        const dayOfWeek = dateObj.getUTCDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const maxLimitMinutes = isWeekend ? 600 : 480; // 10h weekend, 8h weekday
        const weekdayName = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][dayOfWeek];

        return {
          date: dateStr,
          day: weekdayName,
          isWeekend,
          scheduledMinutes: data.minutes,
          scheduledHours: Number((data.minutes / 60).toFixed(1)),
          taskCount: data.count,
          tasks: data.titles,
          maxLimitMinutes,
          remainingCapacityMinutes: Math.max(0, maxLimitMinutes - data.minutes),
          isOverCapacity: data.minutes > maxLimitMinutes,
        };
      });
    },
  },

  getGoalContext: {
    kind: "read",
    description:
      "Get the user's long-term syllabus roadmap, goals, daily study limits, and previous AI sprint log notes.",
    inputSchema: { type: "object", properties: {} },
    zodSchema: getGoalContextSchema,
    handler: async (userId) => {
      const doc = await GoalContext.findOne({ userId }).lean();
      return {
        userGoalsMarkdown: doc?.userGoalsMarkdown || "(no goals set)",
        aiSprintLog: doc?.aiSprintLog || "(no sprint history)",
        updatedAt: doc?.updatedAt,
      };
    },
  },

  proposeCreateTask: {
    kind: "propose",
    description:
      "Propose creating a new task. This does NOT write to the database — it creates a proposal the user must approve.",
    inputSchema: {
      type: "object",
      properties: {
        tabName: { type: "string", description: "Which tab this task belongs in, e.g. 'DSA'" },
        title: { type: "string" },
        estimateMinutes: { type: "number", description: "Planned effort in minutes" },
        defaultTimerMinutes: { type: "number", description: "Timer length when dragged onto a timer slot" },
        scheduleForToday: { type: "boolean", description: "Whether to schedule this for today" },
        scheduledDate: { type: "string", description: "Specific date in YYYY-MM-DD format (e.g. 2026-09-22)" },
      },
      required: ["tabName", "title"],
    },
    zodSchema: proposeCreateTaskSchema,
    handler: async (userId, input) => {
      const tabId = await resolveTabId(userId, input.tabName);
      let targetDate: string | null = null;
      if (input.scheduledDate) {
        targetDate = new Date(input.scheduledDate + "T00:00:00.000Z").toISOString();
      } else if (input.scheduleForToday) {
        targetDate = startOfToday(input.tzOffset).toISOString();
      }

      return {
        actionType: "create-task",
        summary: `Create task "${input.title}" in ${input.tabName}${
          input.scheduledDate ? ` (scheduled for ${input.scheduledDate})` : input.scheduleForToday ? " (scheduled for today)" : ""
        }`,
        proposedPayload: {
          tabId: String(tabId),
          title: input.title,
          estimateMinutes: input.estimateMinutes,
          defaultTimerMinutes: input.defaultTimerMinutes,
          scheduledDate: targetDate,
          source: "ai-suggested",
        },
        beforeSnapshot: null,
      };
    },
  },

  proposeCreateTasksBatch: {
    kind: "propose",
    description:
      "Propose creating a batch of tasks across the upcoming 7-day sprint. Allows scheduling multiple tasks across specific dates with daily limits in a single turn.",
    inputSchema: {
      type: "object",
      properties: {
        batchTitle: { type: "string", description: "Title or focus of this batch, e.g. 'Sprint 1: Arrays & System Design LLD'" },
        tasks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              tabName: { type: "string", description: "Which tab (e.g. DSA, System Design, Projects)" },
              title: { type: "string", description: "Task title" },
              estimateMinutes: { type: "number", description: "Estimated duration in minutes" },
              defaultTimerMinutes: { type: "number", description: "Timer slot duration" },
              scheduledDate: { type: "string", description: "YYYY-MM-DD date" },
              description: { type: "string", description: "Optional notes/context" },
            },
            required: ["tabName", "title"],
          },
        },
        sprintAssumptions: { type: "string", description: "Assumptions and pacing rationale" },
      },
      required: ["tasks"],
    },
    zodSchema: proposeCreateTasksBatchSchema,
    handler: async (userId, input) => {
      const resolvedTasks = [];
      for (const t of input.tasks) {
        const tabId = await resolveTabId(userId, t.tabName);
        resolvedTasks.push({
          tabId: String(tabId),
          tabName: t.tabName,
          title: t.title,
          estimateMinutes: t.estimateMinutes ?? 60,
          defaultTimerMinutes: t.defaultTimerMinutes ?? 30,
          scheduledDate: t.scheduledDate ? new Date(t.scheduledDate + "T00:00:00.000Z").toISOString() : null,
          description: t.description ?? "",
          source: "ai-suggested",
        });
      }

      return {
        actionType: "create-tasks-batch",
        summary: `Create sprint batch "${input.batchTitle ?? "Weekly Sprint"}" with ${resolvedTasks.length} tasks across 7 days`,
        proposedPayload: {
          batchTitle: input.batchTitle ?? "Weekly Sprint",
          tasks: resolvedTasks,
          sprintAssumptions: input.sprintAssumptions ?? "",
        },
        beforeSnapshot: null,
      };
    },
  },

  proposeUpdateSprintLog: {
    kind: "propose",
    description:
      "Propose recording sprint retrospective, pacing progress, and notes into the AI Sprint Log section of the Goals document.",
    inputSchema: {
      type: "object",
      properties: {
        sprintNotes: { type: "string", description: "Sprint retrospective, pacing progress, and notes for next iteration" },
        assumptions: { type: "string", description: "Key assumptions and workload balance decisions" },
      },
      required: ["sprintNotes"],
    },
    zodSchema: proposeUpdateSprintLogSchema,
    handler: async (_userId, input) => {
      return {
        actionType: "update-sprint-log",
        summary: "Update AI Sprint Log with new sprint retrospective and assumptions",
        proposedPayload: {
          aiSprintLog: input.assumptions ? `${input.sprintNotes}\n\n### Assumptions\n${input.assumptions}` : input.sprintNotes,
        },
        beforeSnapshot: null,
      };
    },
  },

  proposeUpdateTask: {
    kind: "propose",
    description:
      "Propose updating fields on an existing task (title, estimate, progress, status). Does NOT write to the database.",
    inputSchema: {
      type: "object",
      properties: {
        taskId: { type: "string" },
        title: { type: "string" },
        estimateMinutes: { type: "number" },
        progressPercent: { type: "number" },
        status: { type: "string", enum: ["not-started", "in-progress", "done", "archived"] },
      },
      required: ["taskId"],
    },
    zodSchema: proposeUpdateTaskSchema,
    handler: async (userId, input) => {
      const task = await Task.findOne({ _id: input.taskId, userId }).lean();
      if (!task) throw new Error("Task not found.");
      const { taskId, ...fields } = input;
      return {
        actionType: "update-task",
        summary: `Update "${task.title}": ${Object.keys(fields).join(", ")}`,
        proposedPayload: { taskId, ...fields },
        beforeSnapshot: JSON.parse(JSON.stringify(task)),
      };
    },
  },

  proposeMoveTask: {
    kind: "propose",
    description: "Propose moving a task to a different tab. Does NOT write to the database.",
    inputSchema: {
      type: "object",
      properties: { taskId: { type: "string" }, toTabName: { type: "string" } },
      required: ["taskId", "toTabName"],
    },
    zodSchema: proposeMoveTaskSchema,
    handler: async (userId, input) => {
      const task = await Task.findOne({ _id: input.taskId, userId }).lean();
      if (!task) throw new Error("Task not found.");
      const toTabId = await resolveTabId(userId, input.toTabName);
      return {
        actionType: "move-task",
        summary: `Move "${task.title}" to ${input.toTabName}`,
        proposedPayload: { taskId: input.taskId, tabId: String(toTabId) },
        beforeSnapshot: JSON.parse(JSON.stringify(task)),
      };
    },
  },

  proposeSetSchedule: {
    kind: "propose",
    description: "Propose scheduling (or unscheduling) a task for today. Does NOT write to the database.",
    inputSchema: {
      type: "object",
      properties: { taskId: { type: "string" }, scheduleForToday: { type: "boolean" } },
      required: ["taskId", "scheduleForToday"],
    },
    zodSchema: proposeSetScheduleSchema,
    handler: async (userId, input) => {
      const task = await Task.findOne({ _id: input.taskId, userId }).lean();
      if (!task) throw new Error("Task not found.");
      return {
        actionType: "set-schedule",
        summary: `${input.scheduleForToday ? "Schedule" : "Unschedule"} "${task.title}" ${
          input.scheduleForToday ? "for today" : ""
        }`.trim(),
        proposedPayload: {
          taskId: input.taskId,
          scheduledDate: input.scheduleForToday ? startOfToday(input.tzOffset).toISOString() : null,
        },
        beforeSnapshot: JSON.parse(JSON.stringify(task)),
      };
    },
  },

  proposeCreateTab: {
    kind: "propose",
    description: "Propose creating a new tab (category). Does NOT write to the database.",
    inputSchema: {
      type: "object",
      properties: { name: { type: "string" } },
      required: ["name"],
    },
    zodSchema: proposeCreateTabSchema,
    handler: async (_userId, input) => ({
      actionType: "create-tab",
      summary: `Create tab "${input.name}"`,
      proposedPayload: { name: input.name },
      beforeSnapshot: null,
    }),
  },

  proposeArchiveTask: {
    kind: "propose",
    description: "Propose archiving (soft-deleting) a task. Does NOT write to the database.",
    inputSchema: {
      type: "object",
      properties: { taskId: { type: "string" } },
      required: ["taskId"],
    },
    zodSchema: proposeArchiveTaskSchema,
    handler: async (userId, input) => {
      const task = await Task.findOne({ _id: input.taskId, userId }).lean();
      if (!task) throw new Error("Task not found.");
      return {
        actionType: "archive-task",
        summary: `Archive "${task.title}"`,
        proposedPayload: { taskId: input.taskId },
        beforeSnapshot: JSON.parse(JSON.stringify(task)),
      };
    },
  },

  proposeCreateScheduledTask: {
    kind: "propose",
    description:
      "Propose creating a recurring scheduled task/series (e.g. 'Every day at 7:00 PM meet', 'Mon/Wed/Fri at 2:30 PM meet', 'Every Sunday at 8:00 AM contest', 'Every alternate Saturday at 8:00 AM LeetCode contest'). Does NOT write to DB or Google Calendar without user approval.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Title of the scheduled task" },
        startTime: { type: "string", description: "Time of day in HH:mm 24-hour format, e.g. '19:00' or '08:00'" },
        durationMinutes: { type: "number", description: "Duration in minutes" },
        recurrenceType: { type: "string", enum: ["daily", "weekdays", "weekly", "biweekly", "custom"] },
        daysOfWeek: { type: "array", items: { type: "number" }, description: "0=Sunday, 1=Monday, ..., 6=Saturday" },
        intervalWeeks: { type: "number", description: "Recurrence interval, e.g. 2 for alternate weeks" },
        reminderMinutes: { type: "number", description: "Reminder minutes before event, default 10" },
        description: { type: "string", description: "Optional description" },
      },
      required: ["title", "startTime"],
    },
    zodSchema: proposeCreateScheduledTaskSchema,
    handler: async (_userId, input) => {
      const rrule = buildRRule({
        type: input.recurrenceType,
        daysOfWeek: input.daysOfWeek,
        intervalWeeks: input.intervalWeeks,
      });
      const label = formatRecurrenceLabel(rrule, input.startTime);
      return {
        actionType: "create-scheduled-task",
        summary: `Schedule recurring task "${input.title}" (${label}) with ${input.reminderMinutes}m reminder`,
        proposedPayload: {
          title: input.title,
          startTime: input.startTime,
          durationMinutes: input.durationMinutes,
          recurrenceRule: rrule,
          recurrenceLabel: label,
          reminderMinutes: input.reminderMinutes,
          description: input.description,
        },
        beforeSnapshot: null,
      };
    },
  },

  proposeDeleteScheduledTask: {
    kind: "propose",
    description: "Propose deleting a recurring scheduled task. Does NOT write to DB without user approval.",
    inputSchema: {
      type: "object",
      properties: { scheduledTaskId: { type: "string" } },
      required: ["scheduledTaskId"],
    },
    zodSchema: proposeDeleteScheduledTaskSchema,
    handler: async (userId, input) => {
      const { ScheduledTask } = await import("@/lib/db/models/ScheduledTask");
      const existing = await ScheduledTask.findOne({ _id: input.scheduledTaskId, userId }).lean();
      if (!existing) throw new Error("Scheduled task not found.");
      return {
        actionType: "delete-scheduled-task",
        summary: `Delete scheduled recurring task "${existing.title}"`,
        proposedPayload: { scheduledTaskId: input.scheduledTaskId },
        beforeSnapshot: JSON.parse(JSON.stringify(existing)),
      };
    },
  },
};

export const READ_TOOL_NAMES = Object.entries(TOOLS)
  .filter(([, def]) => def.kind === "read")
  .map(([name]) => name);

export const PROPOSE_TOOL_NAMES = Object.entries(TOOLS)
  .filter(([, def]) => def.kind === "propose")
  .map(([name]) => name);

/** Builds the Anthropic tool list for the given mode. */
export function buildToolsForMode(mode: "suggest" | "update"): Anthropic.Tool[] {
  const names = mode === "update" ? Object.keys(TOOLS) : READ_TOOL_NAMES;
  return names.map((name) => {
    const def = TOOLS[name]!;
    return { name, description: def.description, input_schema: def.inputSchema };
  });
}
