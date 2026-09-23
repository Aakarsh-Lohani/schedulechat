import { toOpenAITools } from "./tools";
import { executeToolCall } from "@/lib/ai/providers/common";
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import type { ChatStepInput, ChatStepResult, TurnState } from "@/lib/ai/providers/types";

interface OpenAIMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: {
      name: string;
      arguments: string;
    };
  }>;
  tool_call_id?: string;
}

/**
 * Runs a chat step using a locally-hosted OpenAI-compatible LLM in LM Studio.
 */
export async function runLocalStep(input: ChatStepInput): Promise<ChatStepResult> {
  const { userId, mode, systemPrompt, history, message, model: requestedModel, turnState, onProgress } = input;
  const env = getEnv();
  const baseUrl = env.LOCAL_AI_BASE_URL || "http://127.0.0.1:1234/v1";

  // Strip 'local/' prefix if present
  const modelName = (requestedModel || "local-model").replace(/^local\//, "");

  const stepNumber = (turnState?.stepNumber || 0) + 1;
  onProgress?.({
    type: "status",
    text: stepNumber === 1
      ? `Sending request to local LM Studio model (${modelName})...`
      : "Evaluating local model plan and tool results...",
  });

  // Build OpenAI-compatible messages history
  let messages: OpenAIMessage[] = [];

  if (turnState?.geminiContents && Array.isArray(turnState.geminiContents)) {
    // If resuming from prior local turn state
    messages = [...(turnState.geminiContents as OpenAIMessage[])];
  } else {
    messages.push({ role: "system", content: systemPrompt });
    for (const h of history) {
      messages.push({ role: h.role, content: h.content });
    }
    if (message && message.trim()) {
      messages.push({ role: "user", content: message.trim() });
    }
  }

  const tools = toOpenAITools(mode);

  let completionRes: Response;
  try {
    completionRes = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: modelName,
        messages,
        tools: tools.length > 0 ? tools : undefined,
        temperature: 0.3,
        stream: false,
      }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error({ err, baseUrl, modelName }, "Local LM Studio request failed");
    throw new Error(`Failed to communicate with LM Studio at ${baseUrl}: ${errorMsg}. Make sure LM Studio Local Server is running.`);
  }

  if (!completionRes.ok) {
    const errorBody = await completionRes.text();
    throw new Error(`LM Studio returned ${completionRes.status}: ${errorBody}`);
  }

  const data = await completionRes.json();
  const choice = data.choices?.[0];
  const responseMessage = choice?.message;

  if (!responseMessage) {
    return {
      isFinal: true,
      replyText: "(no response from local model)",
      createdActionIds: turnState?.createdActionIds || [],
    };
  }

  messages.push(responseMessage);

  const toolCalls = responseMessage.tool_calls || [];
  const thinkingSteps: string[] = [];

  // If intermediate text alongside calls, stream as thinking
  if (responseMessage.content && toolCalls.length > 0) {
    thinkingSteps.push(responseMessage.content);
    onProgress?.({ type: "thinking", text: responseMessage.content });
  }

  // If no tool calls, this turn is final
  if (toolCalls.length === 0) {
    let finalProse = responseMessage.content || "";
    const accumulatedActions = turnState?.createdActionIds || [];
    if (!finalProse.trim() && accumulatedActions.length > 0) {
      finalProse = `I have reviewed your Goals and scheduled your next sprint within your daily study limits.\n\nPlease review the proposed changes above and click **Approve** to commit them to your board.`;
    }
    return {
      isFinal: true,
      replyText: finalProse || "(done)",
      createdActionIds: accumulatedActions,
      thinkingSteps,
    };
  }

  // Execute tool calls
  const createdActionIdsThisStep: string[] = [];

  for (const call of toolCalls) {
    const fnName = call.function.name;
    let fnArgs: Record<string, unknown> = {};
    try {
      fnArgs = JSON.parse(call.function.arguments || "{}");
    } catch {
      fnArgs = {};
    }

    onProgress?.({ type: "status", text: `Executing: ${fnName}...` });
    onProgress?.({
      type: "tool_call",
      text: `Executing ${fnName}`,
      toolName: fnName,
      toolArgs: fnArgs,
    });

    const toolResult = await executeToolCall(userId, mode, fnName, fnArgs);
    if (toolResult.createdActionId) createdActionIdsThisStep.push(toolResult.createdActionId);

    const resultSnippet = toolResult.resultText.length > 300
      ? toolResult.resultText.slice(0, 300) + "…"
      : toolResult.resultText;

    onProgress?.({
      type: "tool_result",
      text: resultSnippet,
      toolName: fnName,
      isError: toolResult.isError,
    });

    messages.push({
      role: "tool",
      tool_call_id: call.id,
      content: toolResult.resultText,
    });
  }

  const nextTurnState: TurnState = {
    provider: "local",
    engineVersion: "v2",
    stepNumber,
    geminiContents: messages as unknown[],
    createdActionIds: [...(turnState?.createdActionIds || []), ...createdActionIdsThisStep],
    accumulatedThinking: [...(turnState?.accumulatedThinking || []), ...thinkingSteps],
  };

  return {
    isFinal: false,
    createdActionIds: createdActionIdsThisStep,
    thinkingSteps,
    nextTurnState,
  };
}
