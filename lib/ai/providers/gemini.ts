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

async function generateStreamWithRetry(
  model: ReturnType<GoogleGenerativeAI["getGenerativeModel"]>,
  request: { contents: Content[] },
  onProgress?: (event: { type: string; text: string }) => void,
  maxRetries = 3
) {
  let attempt = 0;
  while (true) {
    try {
      const streamResult = await model.generateContentStream(request);
      const thinkingSteps: string[] = [];
      const rawPartsWithSignatures: any[] = [];

      // Forward chunks as they arrive — keeps SSE alive
      for await (const chunk of streamResult.stream) {
        const parts = chunk.candidates?.[0]?.content?.parts ?? [];
        for (const part of parts) {
          const rawP = part as any;
          if (rawP.thought_signature || rawP.thoughtSignature || rawP.functionCall) {
            rawPartsWithSignatures.push(rawP);
          }
          const p = part as { thought?: boolean; text?: string };
          if (p.thought && p.text) {
            thinkingSteps.push(p.text);
            onProgress?.({ type: "thinking", text: p.text });
          }
        }
      }

      const response = await streamResult.response;

      // Restore thought_signature stripped by legacy SDK's aggregateResponses
      const candidate = response.candidates?.[0];
      if (candidate?.content && Array.isArray(candidate.content.parts)) {
        for (const p of candidate.content.parts as any[]) {
          if (p.functionCall && !p.thought_signature && !p.thoughtSignature) {
            const match =
              rawPartsWithSignatures.find(
                (r) => r.functionCall?.name === p.functionCall.name && (r.thought_signature || r.thoughtSignature)
              ) || rawPartsWithSignatures.find((r) => r.thought_signature || r.thoughtSignature);

            const sig = match?.thought_signature || match?.thoughtSignature;
            if (sig) {
              p.thought_signature = sig;
              p.thoughtSignature = sig;
            }
          }
        }
      }

      return { response, thinkingSteps };
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

    let result: Awaited<ReturnType<typeof generateStreamWithRetry>>;
    try {
      result = await generateStreamWithRetry(model, { contents }, onProgress ? (e) => onProgress(e as any) : undefined);
    } catch (firstErr: unknown) {
      // If thinkingConfig was rejected, retry without it once
      const errMsg = firstErr instanceof Error ? firstErr.message : String(firstErr);
      if (thinkingEnabled && (errMsg.includes("thinkingConfig") || errMsg.includes("Invalid argument") || errMsg.includes("thought_signature"))) {
        thinkingEnabled = false;
        model = getClient().getGenerativeModel({
          model: modelName,
          tools: toGeminiTools(mode),
          systemInstruction: systemPrompt,
          generationConfig: genConfigWithout as unknown as import("@google/generative-ai").GenerationConfig,
        });
        result = await generateStreamWithRetry(model, { contents }, onProgress ? (e) => onProgress(e as any) : undefined);
      } else {
        throw firstErr;
      }
    }

    const candidate = result.response.candidates?.[0];
    if (!candidate?.content) break;

    // Thinking was already extracted during streaming
    thinkingSteps.push(...result.thinkingSteps);

    // Append model response to conversation history
    contents.push(candidate.content);

    // Extract images if generated by multimodal/image models (e.g. Nano Banana / gemini-3-pro-image)
    const imageMarkdownParts: string[] = [];
    if (Array.isArray(candidate.content.parts)) {
      for (const part of candidate.content.parts) {
        const inline = (part as { inlineData?: { mimeType: string; data: string } }).inlineData;
        if (inline?.data && (inline.mimeType?.startsWith("image/") || inline.mimeType?.includes("image"))) {
          imageMarkdownParts.push(`![Generated Image](data:${inline.mimeType};base64,${inline.data})`);
        }
      }
    }

    // Capture text output if present (safely handle binary/image-only candidates)
    let responseText = "";
    try {
      responseText = result.response.text?.() || "";
    } catch {
      // Candidate may contain only image/binary parts
    }
    if (imageMarkdownParts.length > 0) {
      responseText = (responseText.trim() ? `${responseText.trim()}\n\n` : "") + imageMarkdownParts.join("\n\n");
    }
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
      onProgress?.({
        type: "tool_call",
        text: `Executing ${call.name}`,
        toolName: call.name,
        toolArgs: call.args as Record<string, unknown>,
      });

      const toolResult = await executeToolCall(userId, mode, call.name, call.args);
      if (toolResult.createdActionId) createdActionIds.push(toolResult.createdActionId);

      const resultSnippet = toolResult.resultText.length > 300
        ? toolResult.resultText.slice(0, 300) + "…"
        : toolResult.resultText;

      onProgress?.({
        type: "tool_result",
        text: resultSnippet,
        toolName: call.name,
        isError: toolResult.isError,
      });

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
