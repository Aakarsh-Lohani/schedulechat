import { GoogleGenAI } from "@google/genai";
import { getEnv } from "@/lib/env";

let genaiClient: GoogleGenAI | null = null;

export function getGenAIClient(): GoogleGenAI {
  if (!genaiClient) {
    const env = getEnv();
    const apiKey = env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not defined in environment");
    }
    genaiClient = new GoogleGenAI({ apiKey });
  }
  return genaiClient;
}
