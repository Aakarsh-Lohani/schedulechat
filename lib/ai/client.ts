import Anthropic from "@anthropic-ai/sdk";
import { getEnv } from "@/lib/env";

let client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: getEnv().ANTHROPIC_API_KEY });
  }
  return client;
}

// Update this if Anthropic ships a newer default model — check
// https://docs.claude.com/en/docs/about-claude/models for the current list.
export const CHAT_MODEL = "claude-sonnet-5";
