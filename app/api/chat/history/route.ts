import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db/connect";
import { getCurrentUserId } from "@/lib/session";
import { ChatMessage } from "@/lib/db/models/ChatMessage";

const HISTORY_PAGE_SIZE = 50;

/** Returns the most recent chat messages, oldest first, so a page refresh doesn't lose the thread. */
export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });

  await connectDB();
  const docs = await ChatMessage.find({ userId }).sort({ createdAt: -1 }).limit(HISTORY_PAGE_SIZE).lean();
  docs.reverse();

  return NextResponse.json({
    messages: docs
      .filter((m) => m.role !== "system-note")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
  });
}
