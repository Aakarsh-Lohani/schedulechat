import pino from "pino";

/**
 * Structured logging for the app's own runtime (separate from the /log documentation
 * folder). Every AI tool call and every write should log through this, per
 * rules/00-engineering-rules.md §4.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { service: "schedulechat" },
});
