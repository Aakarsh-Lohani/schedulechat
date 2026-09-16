import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db/connect";
import { getCurrentUserId } from "@/lib/session";
import { Conversation } from "@/lib/db/models/Conversation";

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });

  await connectDB();
  const convos = await Conversation.find({ userId }).sort({ updatedAt: -1 }).limit(50).lean();

  return NextResponse.json({
    conversations: convos.map((c) => ({
      id: String(c._id),
      title: c.title,
      createdAt: c.createdAt ? new Date(c.createdAt).toISOString() : new Date().toISOString(),
      updatedAt: c.updatedAt ? new Date(c.updatedAt).toISOString() : new Date().toISOString(),
    })),
  });
}

export async function POST(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const title = typeof body?.title === "string" && body.title.trim() ? body.title.trim().slice(0, 80) : "New Chat";

  await connectDB();
  const convo = await Conversation.create({
    userId,
    title,
  });

  return NextResponse.json(
    {
      conversation: {
        id: String(convo._id),
        title: convo.title,
        createdAt: convo.createdAt ? new Date(convo.createdAt).toISOString() : new Date().toISOString(),
        updatedAt: convo.updatedAt ? new Date(convo.updatedAt).toISOString() : new Date().toISOString(),
      },
    },
    { status: 201 }
  );
}
