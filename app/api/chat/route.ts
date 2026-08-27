import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db/connect";
import { getCurrentUserId } from "@/lib/session";
import { chatRequestSchema } from "@/lib/validation/schemas";
import { buildSystemPrompt } from "@/lib/ai/systemPrompt";
import { buildContextSnapshot } from "@/lib/ai/context";
import { runChatTurn } from "@/lib/ai";
import { ChatMessage } from "@/lib/db/models/ChatMessage";
import { AIAction } from "@/lib/db/models/AIAction";
import { checkRateLimit } from "@/lib/rateLimit";
import { logger } from "@/lib/logger";

const HISTORY_LIMIT = 12;

export async function POST(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });

  const rate = checkRateLimit(`chat:${userId}`, { capacity: 20, refillPerMinute: 20 });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many messages, slow down a little.", code: "RATE_LIMITED" },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds ?? 5) } }
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = chatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", code: "VALIDATION_ERROR" }, { status: 400 });
  }
  const { message, mode } = parsed.data;

  await connectDB();

  await ChatMessage.create({ userId, role: "user", content: message, mode });

  const historyDocs = await ChatMessage.find({ userId }).sort({ createdAt: -1 }).limit(HISTORY_LIMIT).lean();
  historyDocs.reverse();

  const contextSnapshot = await buildContextSnapshot(userId);
  const systemPrompt = `${buildSystemPrompt(mode)}\n\n${contextSnapshot}`;

  logger.info({ userId, mode, provider: process.env.AI_PROVIDER ?? "anthropic" }, "chat turn started");

  const result = await runChatTurn({
    userId,
    mode,
    systemPrompt,
    history: historyDocs.map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content })),
  });

  const assistantMessage = await ChatMessage.create({
    userId,
    role: "assistant",
    content: result.replyText,
    mode,
    relatedActionIds: result.createdActionIds,
  });

  const proposals = result.createdActionIds.length
    ? await AIAction.find({ _id: { $in: result.createdActionIds } }).lean()
    : [];

  return NextResponse.json({
    reply: assistantMessage.content,
    proposals: proposals.map((p) => ({
      id: String(p._id),
      type: p.type,
      summary: p.summary,
      status: p.status,
    })),
  });
}
