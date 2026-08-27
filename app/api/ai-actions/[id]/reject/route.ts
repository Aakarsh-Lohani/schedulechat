import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db/connect";
import { getCurrentUserId } from "@/lib/session";
import { AIAction } from "@/lib/db/models/AIAction";
import { objectIdString } from "@/lib/validation/schemas";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
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

  action.status = "rejected";
  await action.save();

  return NextResponse.json({ action: { id: String(action._id), status: action.status } });
}
