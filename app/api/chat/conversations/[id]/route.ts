import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db/connect";
import { getCurrentUserId } from "@/lib/session";
import { Conversation } from "@/lib/db/models/Conversation";
import { ChatMessage } from "@/lib/db/models/ChatMessage";
import { objectIdString } from "@/lib/validation/schemas";

export async function PATCH(req: Request, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  if (!objectIdString.safeParse(params.id).success) {
    return NextResponse.json({ error: "Invalid id", code: "VALIDATION_ERROR" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const title = typeof body?.title === "string" ? body.title.trim().slice(0, 80) : "";
  if (!title) {
    return NextResponse.json({ error: "Title cannot be empty", code: "VALIDATION_ERROR" }, { status: 400 });
  }

  await connectDB();
  const convo = await Conversation.findOneAndUpdate(
    { _id: params.id, userId },
    { $set: { title } },
    { new: true }
  ).lean();

  if (!convo) return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });

  return NextResponse.json({
    conversation: {
      id: String(convo._id),
      title: convo.title,
      updatedAt: convo.updatedAt ? new Date(convo.updatedAt).toISOString() : new Date().toISOString(),
    },
  });
}

export async function DELETE(_req: Request, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  if (!objectIdString.safeParse(params.id).success) {
    return NextResponse.json({ error: "Invalid id", code: "VALIDATION_ERROR" }, { status: 400 });
  }

  await connectDB();
  const convo = await Conversation.findOneAndDelete({ _id: params.id, userId });
  if (!convo) return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });

  // Delete all messages belonging to this conversation
  await ChatMessage.deleteMany({ userId, conversationId: params.id });

  return NextResponse.json({ ok: true });
}
