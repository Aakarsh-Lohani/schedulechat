import { GoogleGenerativeAI, type Content, type FunctionDeclarationSchema, type FunctionDeclarationsTool, type Part } from "@google/generative-ai";
import { getEnv } from "@/lib/env";
import { buildToolsForMode } from "@/lib/ai/tools";
import { executeToolCall } from "@/lib/ai/providers/common";
import type { ChatTurnInput, ChatTurnResult } from "@/lib/ai/providers/types";

const MAX_TOOL_ITERATIONS = 10;

// Update this if Google ships a newer default model — check
// https://ai.google.dev/gemini-api/docs/models for the current list.
const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";

export const AVAILABLE_GEMINI_MODELS = [
  { id: "gemini-3.8-flash", label: "Gemini 3.8 Flash (Flagship)" },
  { id: "gemini-3.7-flash", label: "Gemini 3.7 Flash" },
  { id: "gemini-3.6-flash", label: "Gemini 3.6 Flash" },
  { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash" },
  { id: "gemini-3.1-pro", label: "Gemini 3.1 Pro" },
] as const;

let client: GoogleGenerativeAI | null = null;
function getClient(): GoogleGenerativeAI {
  if (!client) client = new GoogleGenerativeAI(getEnv().GEMINI_API_KEY as string);
  return client;
}

/**
 * Our tool registry already describes each tool's parameters as a JSON Schema
 * object with lowercase types ("object" / "string" / "number" / "boolean" / ...),
 * which is exactly what Gemini's FunctionDeclarationSchema (OpenAPI 3.0 subset)
 * expects.
 */
function toGeminiTools(mode: "suggest" | "update"): FunctionDeclarationsTool[] {
  const tools = buildToolsForMode(mode);
  return [
    {
      functionDeclarations: tools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.input_schema as unknown as FunctionDeclarationSchema,
      })),
    },
  ];
}

async function generateWithRetry(
  model: ReturnType<GoogleGenerativeAI["getGenerativeModel"]>,
  request: { contents: Content[] },
  maxRetries = 3
) {
  let attempt = 0;
  while (true) {
    try {
      return await model.generateContent(request);
    } catch (err: unknown) {
      attempt++;
      const errObj = err as { status?: number; message?: string };
      const isRateLimit =
        errObj?.status === 429 ||
        errObj?.message?.includes("429") ||
        errObj?.message?.includes("RESOURCE_EXHAUSTED") ||
        errObj?.status === 503;
      if (isRateLimit && attempt <= maxRetries) {
        const delay = Math.pow(2, attempt) * 1000 + Math.floor(Math.random() * 500);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
}

export async function runGeminiChat(input: ChatTurnInput): Promise<ChatTurnResult> {
  const { userId, mode, systemPrompt, history, model: requestedModel, onProgress } = input;

  const modelName = requestedModel || DEFAULT_GEMINI_MODEL;

  // Build generationConfig with thinkingConfig to enable Chain of Thought.
  // If the model rejects thinkingConfig (older model), we retry without it.
  const genConfigWithThinking: Record<string, unknown> = {
    maxOutputTokens: 8192,
    thinkingConfig: { includeThoughts: true },
  };
  const genConfigWithout: Record<string, unknown> = {
    maxOutputTokens: 8192,
  };

  let model = getClient().getGenerativeModel({
    model: modelName,
    tools: toGeminiTools(mode),
    systemInstruction: systemPrompt,
    generationConfig: genConfigWithThinking as unknown as import("@google/generative-ai").GenerationConfig,
  });
  let thinkingEnabled = true;

  // Construct conversation turns explicitly using valid Gemini API roles ('user' and 'model').
  // Never uses 'function' role which causes 400 Bad Request.
  const contents: Content[] = history.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const createdActionIds: string[] = [];
  const thinkingSteps: string[] = [];
  let finalText = "";

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    onProgress?.({
      type: "status",
      text: i === 0 ? "Analyzing request..." : "Evaluating tool output and planning...",
    });

    let result: Awaited<ReturnType<typeof generateWithRetry>>;
    try {
      result = await generateWithRetry(model, { contents });
    } catch (firstErr: unknown) {
      // If thinkingConfig was rejected, retry without it once
      const errMsg = firstErr instanceof Error ? firstErr.message : String(firstErr);
      if (thinkingEnabled && (errMsg.includes("thinkingConfig") || errMsg.includes("Invalid argument"))) {
        thinkingEnabled = false;
        model = getClient().getGenerativeModel({
          model: modelName,
          tools: toGeminiTools(mode),
          systemInstruction: systemPrompt,
          generationConfig: genConfigWithout as unknown as import("@google/generative-ai").GenerationConfig,
        });
        result = await generateWithRetry(model, { contents });
      } else {
        throw firstErr;
      }
    }

    const candidate = result.response.candidates?.[0];
    if (!candidate?.content) break;

    // Extract any model reasoning / thought parts (Chain of Thought)
    if (Array.isArray(candidate.content.parts)) {
      for (const part of candidate.content.parts) {
        const p = part as { thought?: boolean; text?: string };
        if (p.thought && p.text) {
          thinkingSteps.push(p.text);
          onProgress?.({ type: "thinking", text: p.text });
        }
      }
    }

    // Append model response to conversation history
    contents.push(candidate.content);

    // Capture text output if present
    const responseText = result.response.text?.();
    const calls = result.response.functionCalls();

    if (responseText && responseText.trim()) {
      if (calls && calls.length > 0) {
        // Text generated alongside function calls is intermediate planning — stream as thinking
        thinkingSteps.push(responseText);
        onProgress?.({ type: "thinking", text: responseText });
      } else {
        finalText = responseText;
      }
    }

    if (!calls || calls.length === 0) break;

    const responseParts: Part[] = [];
    for (const call of calls) {
      onProgress?.({ type: "status", text: `Executing: ${call.name}...` });
      onProgress?.({ type: "thinking", text: `Executing tool: ${call.name}` });

      const toolResult = await executeToolCall(userId, mode, call.name, call.args);
      if (toolResult.createdActionId) createdActionIds.push(toolResult.createdActionId);

      const resultSnippet = toolResult.resultText.length > 300
        ? toolResult.resultText.slice(0, 300) + "…"
        : toolResult.resultText;
      onProgress?.({ type: "thinking", text: `✓ ${call.name} result: ${resultSnippet}` });

      responseParts.push({
        functionResponse: {
          name: call.name,
          response: { result: toolResult.resultText, isError: toolResult.isError },
        },
      });
    }

    // Function results in Gemini API are passed in a turn with role 'user', NOT role 'function'
    contents.push({
      role: "user",
      parts: responseParts,
    });
  }

  // Synthesize a response if the model only called tools without concluding prose
  if (!finalText.trim() && createdActionIds.length > 0) {
    finalText = `I have reviewed your Goals and scheduled your next sprint within your daily study limits (max 8 hours on weekdays, max 10 hours on weekends).

Please review the proposed changes above and click **Approve** to commit them to your board.`;
  }

  return { replyText: finalText || "(no response)", createdActionIds, thinkingSteps };
}
