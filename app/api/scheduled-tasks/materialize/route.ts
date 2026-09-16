import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db/connect";
import { getCurrentUserId } from "@/lib/session";
import { ScheduledTask } from "@/lib/db/models/ScheduledTask";
import { Task } from "@/lib/db/models/Task";
import { Tab } from "@/lib/db/models/Tab";
import { doesRRuleOccurOnDate } from "@/lib/calendar/recurrence";
import { emit } from "@/lib/realtime/emitter";

/**
 * Idempotently materializes scheduled tasks into active Task cards in Today's Tasks
 * for any recurring series whose rule matches the given target date (default: today).
 */
export async function POST(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  // Decommissioned: Scheduled tasks remain isolated and no longer materialize as Task cards
  return NextResponse.json({
    materializedCount: 0,
    tasks: [],
  });
}
