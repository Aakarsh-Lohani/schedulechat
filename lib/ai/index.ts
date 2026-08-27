import { getEnv } from "@/lib/env";
import { runAnthropicChat } from "@/lib/ai/providers/anthropic";
import { runGeminiChat } from "@/lib/ai/providers/gemini";
import type { ChatTurnInput, ChatTurnResult } from "@/lib/ai/providers/types";

export type { ChatTurnInput, ChatTurnResult, ChatTurnMessage } from "@/lib/ai/providers/types";

/**
 * Runs one chat turn against whichever provider is configured via AI_PROVIDER.
 * Both providers implement the exact same propose→approve→execute→undo contract
 * (see lib/ai/providers/common.ts) — switching providers never changes what the
 * AI is allowed to do, only which model reasons about it.
 */
export async function runChatTurn(input: ChatTurnInput): Promise<ChatTurnResult> {
  const { AI_PROVIDER } = getEnv();
  if (AI_PROVIDER === "gemini") return runGeminiChat(input);
  return runAnthropicChat(input);
}
