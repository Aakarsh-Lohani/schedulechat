import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/session";
import { getGoogleCalendarStatus } from "@/lib/calendar/googleCalendarService";

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });

  const status = await getGoogleCalendarStatus(userId);
  return NextResponse.json(status);
}
