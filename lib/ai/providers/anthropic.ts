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

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    onProgress?.({ type: "status", text: i === 0 ? "Analyzing request..." : "Evaluating plan and tool results..." });

    const response = await anthropic.messages.create({
      model: CHAT_MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      tools,
      messages,
    });

    // Capture extended thinking blocks if present
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
    finalText = textBlocks.map((b) => b.text).join("\n") || finalText;

    const toolUseBlocks = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");

    if (toolUseBlocks.length === 0 || response.stop_reason !== "tool_use") {
      break;
    }

    messages.push({ role: "assistant", content: response.content });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of toolUseBlocks) {
      onProgress?.({ type: "status", text: `Executing: ${block.name}...` });
      const result = await executeToolCall(userId, mode, block.name, block.input);
      if (result.createdActionId) createdActionIds.push(result.createdActionId);
      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: result.resultText,
        is_error: result.isError,
      });
    }

    messages.push({ role: "user", content: toolResults });
  }

  return { replyText: finalText || "(no response)", createdActionIds, thinkingSteps };
}
