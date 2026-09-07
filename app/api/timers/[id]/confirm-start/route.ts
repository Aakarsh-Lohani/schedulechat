import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db/connect";
import { getCurrentUserId } from "@/lib/session";
import { TimerSession } from "@/lib/db/models/TimerSession";
import { objectIdString } from "@/lib/validation/schemas";
import { emit } from "@/lib/realtime/emitter";

export async function POST(_req: Request, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  if (!objectIdString.safeParse(params.id).success) {
    return NextResponse.json({ error: "Invalid id", code: "VALIDATION_ERROR" }, { status: 400 });
  }

  await connectDB();
  const session = await TimerSession.findOne({ _id: params.id, userId });
  if (!session) return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });

  // Idempotency: If already running, return 200 without throwing 409
  if (session.status === "running") {
    return NextResponse.json({ session: { id: String(session._id), status: session.status } }, { status: 200 });
  }

  if (session.status !== "countdown") {
    return NextResponse.json({ error: `Session is ${session.status}, not countdown`, code: "INVALID_STATE" }, { status: 409 });
  }

  // Atomically transition from countdown to running
  const updated = await TimerSession.findOneAndUpdate(
    { _id: params.id, userId, status: "countdown" },
    { $set: { status: "running" } },
    { new: true }
  );

  if (!updated) {
    // Check if a concurrent request already transitioned it to running
    const current = await TimerSession.findOne({ _id: params.id, userId });
    if (current && current.status === "running") {
      return NextResponse.json({ session: { id: String(current._id), status: current.status } }, { status: 200 });
    }
    return NextResponse.json({ error: `Session is ${current?.status ?? "unknown"}, not countdown`, code: "INVALID_STATE" }, { status: 409 });
  }

  emit(userId, { type: "timer-changed" });

  return NextResponse.json({ session: { id: String(updated._id), status: updated.status } }, { status: 200 });
}
