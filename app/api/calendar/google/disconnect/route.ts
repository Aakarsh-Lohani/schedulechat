import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/session";
import { disconnectGoogleCalendar } from "@/lib/calendar/googleCalendarService";

export async function POST() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });

  await disconnectGoogleCalendar(userId);
  return NextResponse.json({ success: true });
}
