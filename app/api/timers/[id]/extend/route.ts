import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db/connect";
import { getCurrentUserId } from "@/lib/session";
import { TimerSession } from "@/lib/db/models/TimerSession";
import { extendTimerSchema, objectIdString } from "@/lib/validation/schemas";
import { emit } from "@/lib/realtime/emitter";

export async function POST(req: Request, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  if (!objectIdString.safeParse(params.id).success) {
    return NextResponse.json({ error: "Invalid id", code: "VALIDATION_ERROR" }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const parsed = extendTimerSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request", code: "VALIDATION_ERROR" }, { status: 400 });

  await connectDB();
  const session = await TimerSession.findOne({ _id: params.id, userId });
  if (!session) return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
  if (session.status !== "running") {
    return NextResponse.json({ error: `Session is ${session.status}, not running`, code: "INVALID_STATE" }, { status: 409 });
  }

  session.extendedBySeconds += parsed.data.seconds;
  await session.save();

  emit(userId, { type: "timer-changed" });

  return NextResponse.json({
    session: { id: String(session._id), extendedBySeconds: session.extendedBySeconds },
  });
}

