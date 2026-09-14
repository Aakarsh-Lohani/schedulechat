import { z } from "zod";
import { Types } from "mongoose";
import { Task } from "@/lib/db/models/Task";
import { Tab } from "@/lib/db/models/Tab";
import { TimerSession } from "@/lib/db/models/TimerSession";
import { buildRRule, formatRecurrenceLabel } from "@/lib/calendar/recurrence";
import type Anthropic from "@anthropic-ai/sdk";

/** A proposal is what a `propose*` tool returns — never a direct DB write. */
export interface ToolProposal {
  actionType:
    | "create-task"
    | "update-task"
    | "move-task"
    | "set-schedule"
    | "create-tab"
    | "archive-task"
    | "create-scheduled-task"
    | "delete-scheduled-task";
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

// ---- Propose (write) tools ----

const proposeCreateTaskSchema = z.object({
  tabName: z.string(),
  title: z.string(),
  estimateMinutes: z.number().min(1).max(24 * 60).default(30),
  defaultTimerMinutes: z.number().min(1).max(240).default(30),
  scheduleForToday: z.boolean().default(false),
  tzOffset: z.number().optional(),
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
      },
      required: ["tabName", "title"],
    },
    zodSchema: proposeCreateTaskSchema,
    handler: async (userId, input) => {
      const tabId = await resolveTabId(userId, input.tabName);
      return {
        actionType: "create-task",
        summary: `Create task "${input.title}" in ${input.tabName}${input.scheduleForToday ? " (scheduled for today)" : ""}`,
        proposedPayload: {
          tabId: String(tabId),
          title: input.title,
          estimateMinutes: input.estimateMinutes,
          defaultTimerMinutes: input.defaultTimerMinutes,
          scheduledDate: input.scheduleForToday ? startOfToday(input.tzOffset).toISOString() : null,
          source: "ai-suggested",
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
