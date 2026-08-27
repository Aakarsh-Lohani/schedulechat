import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db/connect";
import { getCurrentUserId } from "@/lib/session";
import { Tab } from "@/lib/db/models/Tab";
import { Task } from "@/lib/db/models/Task";
import { updateTabSchema, objectIdString } from "@/lib/validation/schemas";
import { emit } from "@/lib/realtime/emitter";

export async function PATCH(req: Request, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  if (!objectIdString.safeParse(params.id).success) {
    return NextResponse.json({ error: "Invalid id", code: "VALIDATION_ERROR" }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const parsed = updateTabSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request", code: "VALIDATION_ERROR" }, { status: 400 });

  await connectDB();
  const tab = await Tab.findOneAndUpdate({ _id: params.id, userId }, { $set: parsed.data }, { new: true }).lean();
  if (!tab) return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });

  emit(userId, { type: "task-updated" });

  return NextResponse.json({ tab: { id: String(tab._id), name: tab.name } });
}

/** Soft-delete: archives the tab and moves its tasks to no tab (Unfiled) — human-initiated, explicit. */
export async function DELETE(req: Request, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  if (!objectIdString.safeParse(params.id).success) {
    return NextResponse.json({ error: "Invalid id", code: "VALIDATION_ERROR" }, { status: 400 });
  }

  const url = new URL(req.url);
  const moveToTabId = url.searchParams.get("moveToTabId");

  await connectDB();
  const tab = await Tab.findOne({ _id: params.id, userId });
  if (!tab) return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });

  if (moveToTabId) {
    await Task.updateMany({ userId, tabId: params.id }, { $set: { tabId: moveToTabId } });
  }

  tab.status = "archived";
  await tab.save();

  emit(userId, { type: "task-updated" });

  return NextResponse.json({ ok: true });
}
