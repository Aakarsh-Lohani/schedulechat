import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db/connect";
import { getCurrentUserId } from "@/lib/session";
import { Task } from "@/lib/db/models/Task";
import { updateTaskSchema, objectIdString } from "@/lib/validation/schemas";
import { emit } from "@/lib/realtime/emitter";
import { serializeTask } from "@/lib/api/serialize";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  if (!objectIdString.safeParse(params.id).success) {
    return NextResponse.json({ error: "Invalid id", code: "VALIDATION_ERROR" }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const parsed = updateTaskSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request", code: "VALIDATION_ERROR" }, { status: 400 });

  await connectDB();
  const task = await Task.findOneAndUpdate({ _id: params.id, userId }, { $set: parsed.data }, { new: true }).lean();
  if (!task) return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });

  emit(userId, { type: "task-updated" });

  return NextResponse.json({ task: serializeTask(task) });
}

/** Human-initiated hard delete — separate from the AI's soft-delete-only tool set. */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  if (!objectIdString.safeParse(params.id).success) {
    return NextResponse.json({ error: "Invalid id", code: "VALIDATION_ERROR" }, { status: 400 });
  }

  await connectDB();
  const result = await Task.deleteOne({ _id: params.id, userId });
  if (result.deletedCount === 0) return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });

  emit(userId, { type: "task-updated" });

  return NextResponse.json({ ok: true });
}
