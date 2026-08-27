import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db/connect";
import { getCurrentUserId } from "@/lib/session";
import { AIAction } from "@/lib/db/models/AIAction";

/** Returns the most recent AI actions (proposed + executed + undone), newest first. */
export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });

  await connectDB();
  const actions = await AIAction.find({ userId }).sort({ createdAt: -1 }).limit(25).lean();

  return NextResponse.json({
    actions: actions.map((a) => ({
      id: String(a._id),
      type: a.type,
      summary: a.summary,
      status: a.status,
      createdAt: a.createdAt,
      executedAt: a.executedAt,
      undoneAt: a.undoneAt,
    })),
  });
}
