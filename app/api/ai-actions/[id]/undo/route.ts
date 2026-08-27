import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db/connect";
import { getCurrentUserId } from "@/lib/session";
import { AIAction } from "@/lib/db/models/AIAction";
import { undoExecutedAction } from "@/lib/ai/executeAction";
import { emit } from "@/lib/realtime/emitter";
import { objectIdString } from "@/lib/validation/schemas";
import { logger } from "@/lib/logger";

export async function POST(_req: Request, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  if (!objectIdString.safeParse(params.id).success) {
    return NextResponse.json({ error: "Invalid id", code: "VALIDATION_ERROR" }, { status: 400 });
  }

  await connectDB();
  const action = await AIAction.findOne({ _id: params.id, userId });
  if (!action) return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
  if (action.status !== "executed") {
    return NextResponse.json(
      { error: "Only executed actions can be undone", code: "INVALID_STATE" },
      { status: 409 }
    );
  }

  try {
    await undoExecutedAction(action, userId);
    action.status = "undone";
    action.undoneAt = new Date();
    await action.save();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Undo failed", code: "EXECUTION_ERROR" },
      { status: 500 }
    );
  }

  logger.info({ userId, actionId: params.id, type: action.type }, "ai action undone");
  emit(userId, { type: "ai-action-undone", payload: { actionId: params.id } });
  emit(userId, { type: "task-updated" });

  return NextResponse.json({ action: { id: String(action._id), status: action.status } });
}
