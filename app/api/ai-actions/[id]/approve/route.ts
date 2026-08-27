import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db/connect";
import { getCurrentUserId } from "@/lib/session";
import { AIAction } from "@/lib/db/models/AIAction";
import { executeApprovedAction } from "@/lib/ai/executeAction";
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
  if (action.status !== "proposed") {
    return NextResponse.json({ error: `Action is already ${action.status}`, code: "INVALID_STATE" }, { status: 409 });
  }

  try {
    const afterSnapshot = await executeApprovedAction(action, userId);
    action.status = "executed";
    action.afterSnapshot = afterSnapshot;
    action.executedAt = new Date();
    await action.save();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Execution failed", code: "EXECUTION_ERROR" },
      { status: 500 }
    );
  }

  logger.info({ userId, actionId: params.id, type: action.type }, "ai action approved+executed");
  emit(userId, { type: "ai-action-executed", payload: { actionId: params.id } });
  emit(userId, { type: "task-updated" });

  return NextResponse.json({ action: { id: String(action._id), status: action.status } });
}
