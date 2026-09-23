import { runGeminiStepV2 } from "./gemini";
import { runLocalStep } from "./local";
import type { ChatStepInput, ChatStepResult } from "@/lib/ai/providers/types";

/**
 * Modern AI Engine (v2) entrypoint:
 * - Directs local models to LM Studio runner.
 * - Directs Gemini and Antigravity models to the Google GenAI Interactions API runner.
 */
export async function runModernStep(input: ChatStepInput): Promise<ChatStepResult> {
  const isLocal =
    input.model?.startsWith("local/") ||
    input.turnState?.provider === "local";

  if (isLocal) {
    return runLocalStep(input);
  }

  return runGeminiStepV2(input);
}
