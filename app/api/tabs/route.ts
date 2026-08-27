import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db/connect";
import { getCurrentUserId } from "@/lib/session";
import { Tab } from "@/lib/db/models/Tab";
import { createTabSchema } from "@/lib/validation/schemas";
import { emit } from "@/lib/realtime/emitter";

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });

  await connectDB();
  const tabs = await Tab.find({ userId, status: "active" }).sort({ order: 1 }).lean();
  return NextResponse.json({
    tabs: tabs.map((t) => ({ id: String(t._id), name: t.name, isSystemDefault: t.isSystemDefault, order: t.order })),
  });
}

export async function POST(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = createTabSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request", code: "VALIDATION_ERROR" }, { status: 400 });

  await connectDB();
  const count = await Tab.countDocuments({ userId });
  const tab = await Tab.create({ userId, name: parsed.data.name, order: count, isSystemDefault: false });

  emit(userId, { type: "task-updated" });

  return NextResponse.json({ tab: { id: String(tab._id), name: tab.name, order: tab.order } }, { status: 201 });
}
