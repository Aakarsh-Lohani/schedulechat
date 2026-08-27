import { z } from "zod";

export const objectIdString = z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid id");

export const createTabSchema = z.object({
  name: z.string().min(1).max(60),
});

export const updateTabSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  order: z.number().optional(),
  status: z.enum(["active", "archived"]).optional(),
});

export const createTaskSchema = z.object({
  tabId: objectIdString,
  title: z.string().min(1).max(200),
  description: z.string().max(4000).optional(),
  estimateMinutes: z.number().min(1).max(24 * 60).default(30),
  defaultTimerMinutes: z.number().min(1).max(240).default(30),
  scheduledDate: z.string().datetime().nullable().optional(),
  startDate: z.string().datetime().nullable().optional(),
  endDate: z.string().datetime().nullable().optional(),
  source: z.enum(["manual", "ai-suggested"]).default("manual"),
});

export const updateTaskSchema = z.object({
  tabId: objectIdString.optional(),
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(4000).optional(),
  estimateMinutes: z.number().min(1).max(24 * 60).optional(),
  defaultTimerMinutes: z.number().min(1).max(240).optional(),
  progressPercent: z.number().min(0).max(100).optional(),
  status: z.enum(["not-started", "in-progress", "done", "archived"]).optional(),
  scheduledDate: z.string().datetime().nullable().optional(),
  startDate: z.string().datetime().nullable().optional(),
  endDate: z.string().datetime().nullable().optional(),
  order: z.number().optional(),
  aiAccepted: z.boolean().optional(),
});

export const startTimerSchema = z.object({
  taskId: objectIdString,
  slot: z.union([z.literal(1), z.literal(2)]),
});

export const extendTimerSchema = z.object({
  seconds: z.number().min(1).max(4 * 60 * 60),
});

export const chatRequestSchema = z.object({
  message: z.string().min(1).max(4000),
  mode: z.enum(["suggest", "update"]),
});
