import { z } from "zod";

const envSchema = z
  .object({
    AI_PROVIDER: z.enum(["anthropic", "gemini"]).default("anthropic"),
    ANTHROPIC_API_KEY: z.string().optional(),
    GEMINI_API_KEY: z.string().optional(),
    MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
    NEXTAUTH_SECRET: z.string().min(1, "NEXTAUTH_SECRET is required"),
    NEXTAUTH_URL: z.string().min(1).default("http://localhost:3000"),
    APP_USER_EMAIL: z.string().email().optional(),
    APP_USER_PASSWORD: z.string().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.AI_PROVIDER === "anthropic" && !val.ANTHROPIC_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ANTHROPIC_API_KEY"],
        message: "ANTHROPIC_API_KEY is required when AI_PROVIDER=anthropic",
      });
    }
    if (val.AI_PROVIDER === "gemini" && !val.GEMINI_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["GEMINI_API_KEY"],
        message: "GEMINI_API_KEY is required when AI_PROVIDER=gemini",
      });
    }
  });

type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

/**
 * Lazily validated, cached environment config. Throws with a clear message the
 * first time a required var is missing, instead of surfacing a cryptic failure
 * deep inside a DB call or an AI request.
 */
export function getEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}\n\nCopy .env.example to .env.local and fill it in.`);
  }
  cached = parsed.data;
  return cached;
}
