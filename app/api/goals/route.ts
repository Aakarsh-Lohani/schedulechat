import { NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/db/connect";
import { getCurrentUserId } from "@/lib/session";
import { GoalContext } from "@/lib/db/models/GoalContext";

const patchGoalsSchema = z.object({
  userGoalsMarkdown: z.string().max(20000).optional(),
  aiSprintLog: z.string().max(20000).optional(),
});

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  await connectDB();

  let goalContext = await GoalContext.findOne({ userId });
  if (!goalContext) {
    goalContext = await GoalContext.create({ userId });
  }

  return NextResponse.json({ goalContext });
}

export async function PATCH(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = patchGoalsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", code: "VALIDATION_ERROR" }, { status: 400 });
  }

  await connectDB();

  const updateFields: Record<string, unknown> = {};
  if (parsed.data.userGoalsMarkdown !== undefined) {
    updateFields.userGoalsMarkdown = parsed.data.userGoalsMarkdown;
  }
  if (parsed.data.aiSprintLog !== undefined) {
    updateFields.aiSprintLog = parsed.data.aiSprintLog;
  }

  const updated = await GoalContext.findOneAndUpdate(
    { userId },
    { $set: updateFields },
    { upsert: true, new: true }
  );

  return NextResponse.json({ goalContext: updated });
}
