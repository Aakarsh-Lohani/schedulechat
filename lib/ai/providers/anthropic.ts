import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropicClient, CHAT_MODEL } from "@/lib/ai/client";
import { buildToolsForMode } from "@/lib/ai/tools";
import { executeToolCall } from "@/lib/ai/providers/common";
import type { ChatTurnInput, ChatTurnResult } from "@/lib/ai/providers/types";

const MAX_TOOL_ITERATIONS = 10;

export async function runAnthropicChat(input: ChatTurnInput): Promise<ChatTurnResult> {
  const { userId, mode, systemPrompt, history, onProgress } = input;
  const anthropic = getAnthropicClient();
  const tools = buildToolsForMode(mode);

  const messages: Anthropic.MessageParam[] = history.map((m) => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: m.content,
  }));

  const createdActionIds: string[] = [];
  const thinkingSteps: string[] = [];
  let finalText = "";

  // Try with extended thinking enabled first; fall back to standard if model rejects it
  let useThinking = true;

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    onProgress?.({ type: "status", text: i === 0 ? "Analyzing request..." : "Evaluating plan and tool results..." });

    let response: Anthropic.Message;
    try {
      const createParams: Record<string, unknown> = {
        model: CHAT_MODEL,
        max_tokens: 16384,
        system: systemPrompt,
        tools,
        messages,
      };
      if (useThinking) {
        createParams.thinking = { type: "enabled", budget_tokens: 4096 };
      }
      response = await anthropic.messages.create(createParams as unknown as Anthropic.MessageCreateParamsNonStreaming);
    } catch (firstErr: unknown) {
      const errMsg = firstErr instanceof Error ? firstErr.message : String(firstErr);
      if (useThinking && (errMsg.includes("thinking") || errMsg.includes("not supported"))) {
        // Model doesn't support thinking — retry without it
        useThinking = false;
        response = await anthropic.messages.create({
          model: CHAT_MODEL,
          max_tokens: 4096,
          system: systemPrompt,
          tools,
          messages,
        });
      } else {
        throw firstErr;
      }
    }

    // Capture extended thinking blocks
    for (const block of response.content) {
      if ((block as { type: string }).type === "thinking") {
        const thinkingText = (block as unknown as { thinking?: string }).thinking;
        if (thinkingText) {
          thinkingSteps.push(thinkingText);
          onProgress?.({ type: "thinking", text: thinkingText });
        }
      }
    }

    const textBlocks = response.content.filter((b): b is Anthropic.TextBlock => b.type === "text");
    const turnText = textBlocks.map((b) => b.text).join("\n");
    if (turnText && turnText.trim()) {
      finalText = turnText;
    }

    const toolUseBlocks = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");

    if (toolUseBlocks.length === 0 || response.stop_reason !== "tool_use") {
      break;
    }

    // Stream intermediate text as thinking when there are also tool calls
    if (turnText && turnText.trim() && toolUseBlocks.length > 0) {
      onProgress?.({ type: "thinking", text: turnText });
    }

    messages.push({ role: "assistant", content: response.content });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of toolUseBlocks) {
      onProgress?.({ type: "status", text: `Executing: ${block.name}...` });
      onProgress?.({ type: "thinking", text: `Executing tool: ${block.name}` });

      const result = await executeToolCall(userId, mode, block.name, block.input);
      if (result.createdActionId) createdActionIds.push(result.createdActionId);

      const resultSnippet = result.resultText.length > 300
        ? result.resultText.slice(0, 300) + "…"
        : result.resultText;
      onProgress?.({ type: "thinking", text: `✓ ${block.name} result: ${resultSnippet}` });

      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: result.resultText,
        is_error: result.isError,
      });
    }

    messages.push({ role: "user", content: toolResults });
  }

  // Synthesize a response if the model only called tools without concluding prose
  if (!finalText.trim() && createdActionIds.length > 0) {
    finalText = `I have reviewed your Goals and scheduled your next sprint within your daily study limits (max 8 hours on weekdays, max 10 hours on weekends).

Please review the proposed changes above and click **Approve** to commit them to your board.`;
  }

  return { replyText: finalText || "(no response)", createdActionIds, thinkingSteps };
}
