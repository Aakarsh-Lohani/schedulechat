import { GoogleGenerativeAI, type Content, type FunctionDeclarationSchema, type FunctionDeclarationsTool, type Part } from "@google/generative-ai";
import { getEnv } from "@/lib/env";
import { buildToolsForMode } from "@/lib/ai/tools";
import { executeToolCall } from "@/lib/ai/providers/common";
import type { ChatTurnInput, ChatTurnResult } from "@/lib/ai/providers/types";

const MAX_TOOL_ITERATIONS = 6;

// Update this if Google ships a newer default model — check
// https://ai.google.dev/gemini-api/docs/models for the current list.
const GEMINI_MODEL = "gemini-2.5-flash";

let client: GoogleGenerativeAI | null = null;
function getClient(): GoogleGenerativeAI {
  if (!client) client = new GoogleGenerativeAI(getEnv().GEMINI_API_KEY as string);
  return client;
}

/**
 * Our tool registry already describes each tool's parameters as a JSON Schema
 * object with lowercase types ("object" / "string" / "number" / "boolean" / ...),
 * which is exactly what Gemini's FunctionDeclarationSchema (OpenAPI 3.0 subset)
 * expects — so no real conversion is needed beyond the TypeScript cast.
 */
function toGeminiTools(mode: "suggest" | "update"): FunctionDeclarationsTool[] {
  const tools = buildToolsForMode(mode);
  return [
    {
      functionDeclarations: tools.map((t) => ({
        name: t.name,
        description: t.description,
        // Our JSON Schema tool definitions use the same lowercase type strings
        // Gemini's OpenAPI-subset schema expects — safe structurally, but the two
        // types aren't nominally related, hence the through-unknown cast.
        parameters: t.input_schema as unknown as FunctionDeclarationSchema,
      })),
    },
  ];
}

export async function runGeminiChat(input: ChatTurnInput): Promise<ChatTurnResult> {
  const { userId, mode, systemPrompt, history } = input;

  const model = getClient().getGenerativeModel({
    model: GEMINI_MODEL,
    tools: toGeminiTools(mode),
    systemInstruction: systemPrompt,
  });

  // Gemini uses role "model" instead of "assistant"; the newest user message is
  // sent separately via sendMessage() rather than living in `history`.
  const priorTurns: Content[] = history.slice(0, -1).map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
  const lastMessage = history[history.length - 1]?.content ?? "";

  const chat = model.startChat({ history: priorTurns });

  const createdActionIds: string[] = [];
  let finalText = "";
  let nextInput: string | Part[] = lastMessage;

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const result = await chat.sendMessage(nextInput);
    const response = result.response;
    finalText = response.text() || finalText;

    const calls = response.functionCalls();
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
    nextInput = responseParts;
  }

  return { replyText: finalText || "(no response)", createdActionIds };
}
