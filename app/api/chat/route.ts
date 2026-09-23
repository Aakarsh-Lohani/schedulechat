import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db/connect";
import { getCurrentUserId } from "@/lib/session";
import { chatRequestSchema } from "@/lib/validation/schemas";
import { buildSystemPrompt } from "@/lib/ai/systemPrompt";
import { buildContextSnapshot } from "@/lib/ai/context";
import { runChatTurn, runChatStep, type TurnState } from "@/lib/ai";
import { ChatMessage } from "@/lib/db/models/ChatMessage";
import { Conversation } from "@/lib/db/models/Conversation";
import { AIAction } from "@/lib/db/models/AIAction";
import { checkRateLimit } from "@/lib/rateLimit";
import { logger } from "@/lib/logger";

const HISTORY_LIMIT = 12;
export const maxDuration = 55;

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
  const { message, mode, model, conversationId: requestedConvoId, stream: isStreaming, engineVersion, turnState: incomingTurnState } = parsed.data;

  // Strict Suggest Mode isolation: if MONGODB_READONLY_URI is not configured, do not fall back to main env!
  if (mode === "suggest" && !process.env.MONGODB_READONLY_URI) {
    return NextResponse.json({
      reply:
        "Read-only database setup is not complete (MONGODB_READONLY_URI is not configured). Please configure MONGODB_READONLY_URI in your environment or switch to Update mode.",
      proposals: [],
    });
  }

  await connectDB();

  // Find or create conversation
  let convo = requestedConvoId ? await Conversation.findOne({ _id: requestedConvoId, userId }) : null;
  const initialTitle = message ? message.trim().slice(0, 40) || "New Chat" : "New Chat";
  if (!convo) {
    convo = await Conversation.create({
      userId,
      title: initialTitle,
    });
  } else if (convo.title === "New Chat" && message) {
    convo.title = initialTitle;
    await convo.save();
  }

  const activeConvoId = convo._id;

  // Only create user ChatMessage on the very first step of a turn
  if (!incomingTurnState && message && message.trim()) {
    await ChatMessage.create({
      userId,
      conversationId: activeConvoId,
      role: "user",
      content: message.trim(),
      mode,
    });
  }

  const historyDocs = await ChatMessage.find({ userId, conversationId: activeConvoId })
    .sort({ createdAt: -1 })
    .limit(HISTORY_LIMIT)
    .lean();
  historyDocs.reverse();

  const contextSnapshot = await buildContextSnapshot(userId);
  const systemPrompt = `${buildSystemPrompt(mode)}\n\n${contextSnapshot}`;

  logger.info(
    { userId, mode, model, conversationId: String(activeConvoId), provider: process.env.AI_PROVIDER ?? "anthropic", isStep: Boolean(incomingTurnState) },
    "chat step started"
  );

  // Streaming response mode
  if (isStreaming) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        function emit(data: Record<string, unknown>) {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          } catch {
            // Stream might be closed by client
          }
        }

        try {
          // Heartbeat keeps the SSE connection alive during long Gemini thinking
          const heartbeatInterval = setInterval(() => {
            emit({ type: "heartbeat" });
          }, 15_000);

          let result: Awaited<ReturnType<typeof runChatStep>>;
          try {
            result = await runChatStep({
              userId,
              mode,
              systemPrompt,
              history: historyDocs.map((m) => ({
                role: m.role === "assistant" ? "assistant" : "user",
                content: m.content,
              })),
              message: incomingTurnState ? undefined : message,
              model,
              engineVersion,
              turnState: incomingTurnState as unknown as TurnState,
              onProgress: (event) => {
                emit({
                  type: event.type,
                  text: event.text,
                  toolName: event.toolName,
                  toolArgs: event.toolArgs,
                  isError: event.isError,
                });
              },
            });
          } finally {
            clearInterval(heartbeatInterval);
          }

          if (result.isFinal) {
            const assistantMessage = await ChatMessage.create({
              userId,
              conversationId: activeConvoId,
              role: "assistant",
              content: result.replyText || "(done)",
              mode,
              relatedActionIds: result.createdActionIds,
            });

            await Conversation.updateOne({ _id: activeConvoId }, { $set: { updatedAt: new Date() } });

            const proposals = result.createdActionIds.length
              ? await AIAction.find({ _id: { $in: result.createdActionIds } }).lean()
              : [];

            emit({
              type: "done",
              isFinal: true,
              reply: assistantMessage.content,
              conversationId: String(convo._id),
              conversationTitle: convo.title,
              thinkingSteps: result.thinkingSteps ?? [],
              proposals: proposals.map((p) => ({
                id: String(p._id),
                type: p.type,
                summary: p.summary,
                status: p.status,
              })),
            });
          } else {
            const proposals = result.createdActionIds.length
              ? await AIAction.find({ _id: { $in: result.createdActionIds } }).lean()
              : [];

            emit({
              type: "step_done",
              isFinal: false,
              nextTurnState: result.nextTurnState,
              conversationId: String(convo._id),
              thinkingSteps: result.thinkingSteps ?? [],
              proposals: proposals.map((p) => ({
                id: String(p._id),
                type: p.type,
                summary: p.summary,
                status: p.status,
              })),
            });
          }
        } catch (err: unknown) {
          if (req.signal.aborted) {
            logger.info({ userId }, "chat stream aborted by client");
            emit({ type: "stopped", text: "Generation stopped by user" });
          } else {
            const errorMsg = err instanceof Error ? err.message : "AI turn failed";
            logger.error({ err, userId }, "chat stream turn failed");
            emit({ type: "error", error: `Copilot error: ${errorMsg}` });
          }
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  }

  // Non-streaming fallback
  try {
    const collectedThinking: string[] = [];
    const result = await runChatTurn({
      userId,
      mode,
      systemPrompt,
      history: historyDocs.map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content })),
      model,
      onProgress: (event) => {
        if (event.type === "thinking") collectedThinking.push(event.text);
      },
    });

    const assistantMessage = await ChatMessage.create({
      userId,
      conversationId: activeConvoId,
      role: "assistant",
      content: result.replyText,
      mode,
      relatedActionIds: result.createdActionIds,
    });

    await Conversation.updateOne({ _id: activeConvoId }, { $set: { updatedAt: new Date() } });

    const proposals = result.createdActionIds.length
      ? await AIAction.find({ _id: { $in: result.createdActionIds } }).lean()
      : [];

    return NextResponse.json({
      reply: assistantMessage.content,
      conversationId: String(convo._id),
      conversationTitle: convo.title,
      thinkingSteps: result.thinkingSteps ?? collectedThinking,
      proposals: proposals.map((p) => ({
        id: String(p._id),
        type: p.type,
        summary: p.summary,
        status: p.status,
      })),
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "AI turn failed";
    logger.error({ err, userId }, "chat turn failed");

    return NextResponse.json(
      { error: `Copilot error: ${errorMsg}`, code: "AI_TURN_FAILED" },
      { status: 500 }
    );
  }
}
