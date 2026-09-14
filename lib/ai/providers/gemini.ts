import { GoogleGenerativeAI, type Content, type FunctionDeclarationSchema, type FunctionDeclarationsTool, type Part } from "@google/generative-ai";
import { getEnv } from "@/lib/env";
import { buildToolsForMode } from "@/lib/ai/tools";
import { executeToolCall } from "@/lib/ai/providers/common";
import type { ChatTurnInput, ChatTurnResult } from "@/lib/ai/providers/types";

const MAX_TOOL_ITERATIONS = 6;

// Update this if Google ships a newer default model — check
// https://ai.google.dev/gemini-api/docs/models for the current list.
const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";

export const AVAILABLE_GEMINI_MODELS = [
  { id: "gemini-3.8-flash", label: "Gemini 3.8 Flash (Workhorse Flagship)" },
  { id: "gemini-3.7-flash", label: "Gemini 3.7 Flash (Agentic Reasoning)" },
  { id: "gemini-3.6-flash", label: "Gemini 3.6 Flash" },
  { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash" },
  { id: "gemini-3.1-pro", label: "Gemini 3.1 Pro (Deep Reasoning)" },
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
  const { userId, mode, systemPrompt, history, model: requestedModel } = input;

  const modelName = requestedModel || DEFAULT_GEMINI_MODEL;
  const model = getClient().getGenerativeModel({
    model: modelName,
    tools: toGeminiTools(mode),
    systemInstruction: systemPrompt,
  });

  // Construct conversation turns explicitly using valid Gemini API roles ('user' and 'model').
  // Never uses 'function' role which causes 400 Bad Request.
  const contents: Content[] = history.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const createdActionIds: string[] = [];
  let finalText = "";

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const result = await generateWithRetry(model, { contents });
    const candidate = result.response.candidates?.[0];
    if (!candidate?.content) break;

    // Append model response to conversation history
    contents.push(candidate.content);

    // Capture text output if present
    const responseText = result.response.text?.();
    if (responseText) {
      finalText = responseText;
    }

    const calls = result.response.functionCalls();
    if (!calls || calls.length === 0) break;

    const responseParts: Part[] = [];
    for (const call of calls) {
      const toolResult = await executeToolCall(userId, mode, call.name, call.args);
      if (toolResult.createdActionId) createdActionIds.push(toolResult.createdActionId);
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

  return { replyText: finalText || "(no response)", createdActionIds };
}
