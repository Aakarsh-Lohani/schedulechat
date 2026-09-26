import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { getCurrentUserId } from "@/lib/session";

interface ModelItem {
  id: string;
  label: string;
  isLocal?: boolean;
  isAgent?: boolean;
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
  { id: "antigravity-preview-05-2026", label: "Antigravity Agent [Cloud Agent]", isAgent: true },
];

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

let cachedGeminiModels: ModelItem[] | null = null;
let cacheExpiry = 0;

function getModelPriority(model: ModelItem): number {
  if (model.isLocal) return 0; // Local models first if available
  const target = `${model.id} ${model.label}`.toLowerCase();
  if (target.includes("antigravity")) return 1;
  if (target.includes("flash")) return 2;
  if (target.includes("pro")) return 3;
  return 4;
}

async function fetchLocalModels(baseUrl: string): Promise<ModelItem[]> {
  try {
    const res = await fetch(`${baseUrl}/models`, {
      signal: AbortSignal.timeout(600), // Fast 600ms timeout
    });
    if (!res.ok) return [];
    const data = await res.json();
    const rawList: Array<{ id: string }> = Array.isArray(data?.data) ? data.data : [];

    return rawList
      .filter((m) => {
        const idLower = m.id.toLowerCase();
        // Exclude embedding-only models
        return !idLower.includes("embedding") && !idLower.includes("embed-text");
      })
      .map((m) => ({
        id: `local/${m.id}`,
        label: `${m.id} [Local]`,
        isLocal: true,
      }));
  } catch {
    return [];
  }
}

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const env = getEnv();
  const localBaseUrl = env.LOCAL_AI_BASE_URL || "http://127.0.0.1:1234/v1";

  // Check local LM Studio models on every request (dynamic local status)
  const localModels = await fetchLocalModels(localBaseUrl);

  const now = Date.now();
  let geminiModels: ModelItem[] = [];

  if (cachedGeminiModels && now < cacheExpiry) {
    geminiModels = cachedGeminiModels;
  } else {
    try {
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

      // Add Antigravity Managed Agent
      filtered.push({
        id: "antigravity-preview-05-2026",
        label: "Antigravity Agent [Cloud Agent]",
        isAgent: true,
      });

      filtered.sort((a, b) => getModelPriority(a) - getModelPriority(b));

      cachedGeminiModels = filtered;
      cacheExpiry = now + CACHE_TTL_MS;
      geminiModels = filtered;
    } catch (error) {
      console.error("Failed to fetch Gemini models:", error);
      geminiModels = FALLBACK_MODELS;
    }
  }

  // Combine local models (if LM Studio is active) and cloud Gemini models
  const allModels = [...localModels, ...geminiModels];

  return NextResponse.json({
    models: allModels,
    hasLocalModels: localModels.length > 0,
    engineDefault: env.AI_ENGINE_VERSION || "v2",
  });
}
