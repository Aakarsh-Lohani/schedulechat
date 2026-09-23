import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { getCurrentUserId } from "@/lib/session";

interface ModelItem {
  id: string;
  label: string;
}

interface GeminiApiModel {
  name?: string;
  displayName?: string;
  description?: string;
  supportedGenerationMethods?: string[];
}

const FALLBACK_MODELS: ModelItem[] = [
  { id: "gemini-3.8-flash", label: "Gemini 3.8 Flash" },
  { id: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash Lite" },
  { id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro Preview" },
];

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

let cachedModels: ModelItem[] | null = null;
let cacheExpiry = 0;

function getModelPriority(model: ModelItem): number {
  const target = `${model.id} ${model.label}`.toLowerCase();
  if (target.includes("flash")) return 0;
  if (target.includes("pro")) return 1;
  return 2;
}

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = Date.now();
  if (cachedModels && now < cacheExpiry) {
    return NextResponse.json({ models: cachedModels });
  }

  try {
    const env = getEnv();
    const apiKey = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY;

    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not defined");
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}&pageSize=100`
    );

    if (!response.ok) {
      throw new Error(`Google API returned ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const rawModels: GeminiApiModel[] = Array.isArray(data?.models) ? data.models : [];

    const filtered: ModelItem[] = rawModels
      .filter((m) => {
        const supportsGenerateContent =
          Array.isArray(m.supportedGenerationMethods) &&
          m.supportedGenerationMethods.includes("generateContent");
        const hasGeminiPrefix =
          typeof m.name === "string" && m.name.startsWith("models/gemini-");
        const isDeprecated =
          typeof m.description === "string" &&
          /deprecated/i.test(m.description);

        return supportsGenerateContent && hasGeminiPrefix && !isDeprecated;
      })
      .map((m) => {
        const name = m.name as string;
        const id = name.replace(/^models\//, "");
        const label = m.displayName || id;
        return { id, label };
      });

    if (filtered.length === 0) {
      throw new Error("No compatible Gemini models found from API");
    }

    filtered.sort((a, b) => getModelPriority(a) - getModelPriority(b));

    cachedModels = filtered;
    cacheExpiry = now + CACHE_TTL_MS;

    return NextResponse.json({ models: filtered });
  } catch (error) {
    console.error("Failed to fetch Gemini models:", error);
    return NextResponse.json({ models: FALLBACK_MODELS });
  }
}
