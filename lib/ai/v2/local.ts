import { toOpenAITools } from "./tools";
import { executeToolCall } from "@/lib/ai/providers/common";
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import type { ChatStepInput, ChatStepResult, TurnState } from "@/lib/ai/providers/types";

interface OpenAIMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
  reasoning_content?: string | null;
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
  const { userId, mode, systemPrompt, history, message, model: requestedModel, turnState, onProgress, signal } = input;
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
    // True streaming: stream tokens chunk-by-chunk with user abort signal attached
    completionRes = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      signal,
      body: JSON.stringify({
        model: modelName,
        messages,
        tools: tools.length > 0 ? tools : undefined,
        temperature: 0.3,
        stream: true,
      }),
    });
  } catch (err: unknown) {
    if (signal?.aborted) {
      logger.info({ baseUrl, modelName }, "Local LM Studio request aborted by user");
      return {
        isFinal: true,
        replyText: "(stopped)",
        createdActionIds: turnState?.createdActionIds || [],
      };
    }
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error({ err, baseUrl, modelName }, "Local LM Studio request failed");
    throw new Error(`Failed to communicate with LM Studio at ${baseUrl}: ${errorMsg}. Make sure LM Studio Local Server is running.`);
  }

  if (!completionRes.ok) {
    const errorBody = await completionRes.text();
    throw new Error(`LM Studio returned ${completionRes.status}: ${errorBody}`);
  }

  if (!completionRes.body) {
    throw new Error("No response body received from LM Studio");
  }

  const reader = completionRes.body.getReader();
  const decoder = new TextDecoder();
  let streamBuffer = "";

  let accumulatedContent = "";
  let accumulatedReasoning = "";
  let finishReason: string | null = null;

  // Track streamed tool calls by index
  const streamedToolCalls: Map<
    number,
    {
      id: string;
      type: "function";
      function: { name: string; arguments: string };
    }
  > = new Map();

  // Buffer reasoning chunks to avoid overwhelming the SSE event stream with single characters
  let reasoningBuffer = "";
  let lastReasoningFlush = Date.now();

  function flushReasoning() {
    if (reasoningBuffer) {
      onProgress?.({ type: "thinking", text: reasoningBuffer });
      reasoningBuffer = "";
      lastReasoningFlush = Date.now();
    }
  }

  while (true) {
    if (signal?.aborted) {
      await reader.cancel().catch(() => {});
      break;
    }
    const { done, value } = await reader.read();
    if (done || signal?.aborted) {
      if (signal?.aborted) await reader.cancel().catch(() => {});
      break;
    }

    streamBuffer += decoder.decode(value, { stream: true });
    const lines = streamBuffer.split(/\r?\n/);
    streamBuffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") continue;

      try {
        const parsed = JSON.parse(payload);
        const choice = parsed.choices?.[0];
        if (!choice) continue;

        if (choice.finish_reason) {
          finishReason = choice.finish_reason;
        }

        const delta = choice.delta;
        if (!delta) continue;

        // 1. Live reasoning stream (Qwen / DeepSeek-R1)
        if (delta.reasoning_content) {
          accumulatedReasoning += delta.reasoning_content;
          reasoningBuffer += delta.reasoning_content;
          // Flush every 80ms or on newline
          if (Date.now() - lastReasoningFlush > 80 || delta.reasoning_content.includes("\n")) {
            flushReasoning();
          }
        }

        // 2. Content stream
        if (delta.content) {
          accumulatedContent += delta.content;
        }

        // 3. Tool calls stream
        if (delta.tool_calls && Array.isArray(delta.tool_calls)) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0;
            let existing = streamedToolCalls.get(idx);
            if (!existing) {
              existing = {
                id: tc.id || `call_${idx}_${Date.now()}`,
                type: "function",
                function: { name: tc.function?.name || "", arguments: "" },
              };
              streamedToolCalls.set(idx, existing);
            }
            if (tc.id) existing.id = tc.id;
            if (tc.function?.name) existing.function.name = tc.function.name;
            if (tc.function?.arguments) existing.function.arguments += tc.function.arguments;
          }
        }
      } catch {
        // ignore chunk parse errors
      }
    }
  }

  flushReasoning();

  if (signal?.aborted) {
    return {
      isFinal: true,
      replyText: "(stopped)",
      createdActionIds: turnState?.createdActionIds || [],
    };
  }

  // Also check if <think> tags are present inside accumulatedContent
  let messageContent = accumulatedContent;
  const thinkMatch = messageContent.match(/<think>([\s\S]*?)<\/think>/i);
  if (thinkMatch && thinkMatch[1]) {
    const extractedThought = thinkMatch[1].trim();
    if (extractedThought && !accumulatedReasoning) {
      accumulatedReasoning = extractedThought;
      onProgress?.({ type: "thinking", text: extractedThought });
    }
    messageContent = messageContent.replace(/<think>[\s\S]*?<\/think>/i, "").trim();
  }

  const toolCalls = Array.from(streamedToolCalls.values());
  const thinkingSteps: string[] = [];

  if (accumulatedReasoning.trim()) {
    thinkingSteps.push(accumulatedReasoning.trim());
  }

  // If intermediate text alongside calls, record as thinking
  if (messageContent && toolCalls.length > 0) {
    thinkingSteps.push(messageContent);
    onProgress?.({ type: "thinking", text: messageContent });
  }

  const assistantMsg: OpenAIMessage = {
    role: "assistant",
    content: messageContent || null,
    reasoning_content: accumulatedReasoning || undefined,
    tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
  };
  messages.push(assistantMsg);

  // If no response generated at all
  if (!messageContent && !accumulatedReasoning && toolCalls.length === 0) {
    return {
      isFinal: true,
      replyText: "(no response from local model)",
      createdActionIds: turnState?.createdActionIds || [],
    };
  }

  // If no tool calls, this turn is final
  if (toolCalls.length === 0) {
    let finalProse = messageContent;
    const accumulatedActions = turnState?.createdActionIds || [];

    // If content is empty (e.g. model hit context length limit during thinking),
    // surface the reasoning insights rather than losing everything to "(done)"
    if (!finalProse.trim()) {
      if (accumulatedReasoning && accumulatedReasoning.trim()) {
        finalProse = finishReason === "length"
          ? `${accumulatedReasoning.trim()}\n\n*(Note: The local model reached its context token limit in LM Studio while generating this response. Consider increasing Context Length in LM Studio's model settings).*`
          : accumulatedReasoning.trim();
      } else if (accumulatedActions.length > 0) {
        finalProse = `I have reviewed your Goals and scheduled your next sprint within your daily study limits.\n\nPlease review the proposed changes above and click **Approve** to commit them to your board.`;
      }
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
