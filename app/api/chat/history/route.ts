import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db/connect";
import { getCurrentUserId } from "@/lib/session";
import { ChatMessage } from "@/lib/db/models/ChatMessage";

const HISTORY_PAGE_SIZE = 50;

/** Returns the most recent chat messages, oldest first, for the given or latest conversation. */
export async function GET(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });

  const url = new URL(req.url);
  const conversationId = url.searchParams.get("conversationId");

  await connectDB();
  const query: Record<string, unknown> = { userId };
  if (conversationId) {
    query.conversationId = conversationId;
  }

  const docs = await ChatMessage.find(query).sort({ createdAt: -1 }).limit(HISTORY_PAGE_SIZE).lean();
  docs.reverse();

  return NextResponse.json({
    messages: docs
      .filter((m) => m.role !== "system-note")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
  });
}
