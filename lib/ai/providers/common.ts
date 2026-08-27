import { TOOLS } from "@/lib/ai/tools";
import { AIAction } from "@/lib/db/models/AIAction";
import { logger } from "@/lib/logger";

export interface ToolCallResult {
  resultText: string;
  isError: boolean;
  createdActionId?: string;
}

/**
 * Runs one tool call: validates input, executes the read handler directly or
 * persists a proposal for a write ("propose*") tool. Shared by every LLM provider
 * so the propose→approve→execute→undo guarantee in
 * architecture/01-critical-components.md §B holds no matter which model is talking.
 */
export async function executeToolCall(
  userId: string,
  mode: "suggest" | "update",
  toolName: string,
  rawInput: unknown
): Promise<ToolCallResult> {
  const def = TOOLS[toolName];
  if (!def) {
    return { resultText: "Unknown tool.", isError: true };
  }

  const parsed = def.zodSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { resultText: `Invalid input: ${parsed.error.message}`, isError: true };
  }

  try {
    if (def.kind === "read") {
      const result = await def.handler(userId, parsed.data);
      logger.info({ userId, tool: toolName }, "ai tool call (read)");
      return { resultText: JSON.stringify(result), isError: false };
    }

    const proposal = await def.handler(userId, parsed.data);
    const action = await AIAction.create({
      userId,
      type: proposal.actionType,
      mode,
      summary: proposal.summary,
      proposedPayload: proposal.proposedPayload,
      beforeSnapshot: proposal.beforeSnapshot,
      status: "proposed",
    });
    logger.info({ userId, tool: toolName, actionId: String(action._id) }, "ai tool call (propose)");
    return {
      resultText: `Proposal created (id: ${action._id}): ${proposal.summary}. Awaiting user approval.`,
      isError: false,
      createdActionId: String(action._id),
    };
  } catch (err) {
    logger.warn({ userId, tool: toolName, err: err instanceof Error ? err.message : err }, "ai tool call failed");
    return { resultText: err instanceof Error ? err.message : "Tool execution failed.", isError: true };
  }
}
