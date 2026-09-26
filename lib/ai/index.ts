import { runChatStep as runLegacyStep } from "@/lib/ai/stepTurn";
import { runAnthropicChat } from "@/lib/ai/providers/anthropic";
import { runGeminiChat } from "@/lib/ai/providers/gemini";
import { runModernStep } from "@/lib/ai/v2";
import { getEnv } from "@/lib/env";
import type {
  ChatTurnInput,
  ChatTurnResult,
  ChatStepInput,
  ChatStepResult,
  TurnState,
  ChatTurnMessage,
} from "@/lib/ai/providers/types";

export type {
  ChatTurnInput,
  ChatTurnResult,
  ChatTurnMessage,
  ChatStepInput,
  ChatStepResult,
  TurnState,
};

/**
 * Runs one complete non-streaming chat turn (fallback mode).
 */
export async function runChatTurn(input: ChatTurnInput): Promise<ChatTurnResult> {
  const { AI_PROVIDER } = getEnv();
  if (AI_PROVIDER === "gemini") {
    return runGeminiChat(input);
  }
  return runAnthropicChat(input);
}

/**
 * Master AI Engine Gateway.
 * Routes chat turns between the Modern Engine (v2) and the Legacy Engine (v1).
 *
 * Engine selection:
 * 1. Explicit user/request engine override (input.engineVersion)
 * 2. Environment default (AI_ENGINE_VERSION, defaults to "v2")
 */
export async function runChatStep(input: ChatStepInput): Promise<ChatStepResult> {
  const env = getEnv();
  const selectedEngine = input.engineVersion || input.turnState?.engineVersion || env.AI_ENGINE_VERSION || "v2";

  // If local model is targeted, modern v2 local executor handles it
  if (input.model?.startsWith("local/") || input.turnState?.provider === "local") {
    return runModernStep(input);
  }

  // If user explicitly selected the legacy v1 engine, route to untouched stepTurn.ts
  if (selectedEngine === "v1") {
    return runLegacyStep(input);
  }

  // Default: modern v2 engine (@google/genai Interactions API & Antigravity)
  return runModernStep(input);
}
