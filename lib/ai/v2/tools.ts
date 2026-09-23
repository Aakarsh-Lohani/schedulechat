import { buildToolsForMode } from "@/lib/ai/tools";

export interface GenAIFunctionTool {
  type: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface OpenAIFunctionTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/**
 * Builds tool definitions formatted for Google GenAI v2 Interactions API.
 */
export function toGenAITools(mode: "suggest" | "update"): GenAIFunctionTool[] {
  const tools = buildToolsForMode(mode);
  return tools.map((t) => ({
    type: "function",
    name: t.name,
    description: t.description || "",
    parameters: t.input_schema as unknown as Record<string, unknown>,
  }));
}

/**
 * Builds tool definitions formatted for OpenAI-compatible local APIs (LM Studio).
 */
export function toOpenAITools(mode: "suggest" | "update"): OpenAIFunctionTool[] {
  const tools = buildToolsForMode(mode);
  return tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description || "",
      parameters: t.input_schema as unknown as Record<string, unknown>,
    },
  }));
}
