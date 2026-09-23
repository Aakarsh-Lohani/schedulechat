import { getGenAIClient } from "./client";
import { toGenAITools } from "./tools";
import { executeToolCall } from "@/lib/ai/providers/common";
import type { ChatStepInput, ChatStepResult, TurnState } from "@/lib/ai/providers/types";

const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";

/**
 * Runs a chat step using Google GenAI v2 Interactions API or Antigravity managed agent.
 */
export async function runGeminiStepV2(input: ChatStepInput): Promise<ChatStepResult> {
  const { userId, mode, systemPrompt, history, message, model: requestedModel, turnState, onProgress } = input;
  const client = getGenAIClient();
  const modelName = requestedModel || DEFAULT_GEMINI_MODEL;
  const isAntigravity = modelName === "antigravity-preview-05-2026";

  const stepNumber = (turnState?.stepNumber || 0) + 1;
  onProgress?.({
    type: "status",
    text: stepNumber === 1
      ? (isAntigravity ? "Connecting to Antigravity remote agent environment..." : "Analyzing request with Gemini...")
      : "Evaluating plan and tool results...",
  });

  // 1. Antigravity Agent Flow (Managed Cloud Sandbox)
  if (isAntigravity) {
    let promptText = "";
    if (history.length > 0) {
      promptText += history.map((m) => `${m.role === "assistant" ? "Assistant" : "User"}: ${m.content}`).join("\n\n") + "\n\n";
    }
    if (message && message.trim()) {
      promptText += `User: ${message.trim()}`;
    }

    onProgress?.({ type: "thinking", text: "Antigravity remote container booted. Generating response..." });

    const interaction = await client.interactions.create({
      agent: "antigravity-preview-05-2026",
      environment: "remote",
      input: promptText || "Hello",
    });

    const outputText = (interaction as any).output_text || "(completed)";
    return {
      isFinal: true,
      replyText: outputText,
      createdActionIds: turnState?.createdActionIds || [],
      thinkingSteps: ["Antigravity Agent ran in remote container."],
    };
  }

  // 2. Standard Gemini Model Flow via Interactions API
  const tools = toGenAITools(mode);

  let interaction: any;
  const thinkingSteps: string[] = [];

  if (turnState?.interactionId) {
    // Continuing multi-step turn with server-side interaction state
    onProgress?.({ type: "status", text: "Continuing conversation turn..." });
    interaction = await client.interactions.create({
      model: modelName,
      previous_interaction_id: turnState.interactionId,
      input: message ? message : "Continue execution.",
    });
  } else {
    // Step 1: Initial interaction turn
    let initialPrompt = "";
    if (history.length > 0) {
      initialPrompt += history.map((m) => `${m.role === "assistant" ? "Model" : "User"}: ${m.content}`).join("\n\n") + "\n\n";
    }
    if (message && message.trim()) {
      initialPrompt += message.trim();
    }

    interaction = await client.interactions.create({
      model: modelName,
      system_instruction: systemPrompt,
      tools: tools as any,
      input: initialPrompt || "Hello",
    });
  }

  // Inspect interaction steps for reasoning/thoughts and function calls
  const functionCallSteps: any[] = [];

  if (Array.isArray(interaction.steps)) {
    for (const step of interaction.steps) {
      if (step.type === "thought") {
        const thoughtContent = step.summary?.[0]?.text || step.text || "Reasoning...";
        thinkingSteps.push(thoughtContent);
        onProgress?.({ type: "thinking", text: thoughtContent });
      } else if (step.type === "function_call") {
        functionCallSteps.push(step);
      }
    }
  }

  // If no function calls, this turn is finished
  if (functionCallSteps.length === 0) {
    let finalProse = interaction.output_text || "";

    // Append generated image if model produced an image (e.g. image generation models)
    if (interaction.output_image?.data && interaction.output_image?.mime_type) {
      const imgMd = `\n\n![Generated Image](data:${interaction.output_image.mime_type};base64,${interaction.output_image.data})\n\n`;
      finalProse = (finalProse ? `${finalProse}\n\n` : "") + imgMd;
    }

    const accumulatedActions = turnState?.createdActionIds || [];
    if (!finalProse.trim() && accumulatedActions.length > 0) {
      finalProse = `I have reviewed your Goals and scheduled your next sprint within your daily study limits (max 8 hours on weekdays, max 10 hours on weekends).\n\nPlease review the proposed changes above and click **Approve** to commit them to your board.`;
    }

    return {
      isFinal: true,
      replyText: finalProse || "(done)",
      createdActionIds: accumulatedActions,
      thinkingSteps,
    };
  }

  // Execute tool calls for this turn step
  const createdActionIdsThisStep: string[] = [];
  const functionResults: any[] = [];

  for (const call of functionCallSteps) {
    const toolName = call.name;
    const toolArgs = call.arguments || {};

    onProgress?.({ type: "status", text: `Executing: ${toolName}...` });
    onProgress?.({
      type: "tool_call",
      text: `Executing ${toolName}`,
      toolName,
      toolArgs,
    });

    const toolResult = await executeToolCall(userId, mode, toolName, toolArgs);
    if (toolResult.createdActionId) createdActionIdsThisStep.push(toolResult.createdActionId);

    const resultSnippet = toolResult.resultText.length > 300
      ? toolResult.resultText.slice(0, 300) + "…"
      : toolResult.resultText;

    onProgress?.({
      type: "tool_result",
      text: resultSnippet,
      toolName,
      isError: toolResult.isError,
    });

    functionResults.push({
      type: "function_result",
      name: toolName,
      call_id: call.id,
      result: toolResult.resultText,
    });
  }

  // Send tool results back into the interaction turn
  const followUpInteraction = await client.interactions.create({
    model: modelName,
    previous_interaction_id: interaction.id,
    input: functionResults as any,
  });

  const nextTurnState: TurnState = {
    provider: "gemini",
    engineVersion: "v2",
    stepNumber,
    interactionId: followUpInteraction.id,
    createdActionIds: [...(turnState?.createdActionIds || []), ...createdActionIdsThisStep],
    accumulatedThinking: [...(turnState?.accumulatedThinking || []), ...thinkingSteps],
  };

  // Inspect follow-up interaction to check if more tool calls are needed or if final
  const moreCalls = (followUpInteraction.steps || []).filter((s: any) => s.type === "function_call");
  if (moreCalls.length === 0) {
    let finalProse = followUpInteraction.output_text || "";
    if (followUpInteraction.output_image?.data && followUpInteraction.output_image?.mime_type) {
      finalProse += `\n\n![Generated Image](data:${followUpInteraction.output_image.mime_type};base64,${followUpInteraction.output_image.data})\n\n`;
    }
    return {
      isFinal: true,
      replyText: finalProse || "(done)",
      createdActionIds: nextTurnState.createdActionIds,
      thinkingSteps,
      nextTurnState,
    };
  }

  return {
    isFinal: false,
    createdActionIds: createdActionIdsThisStep,
    thinkingSteps,
    nextTurnState,
  };
}
