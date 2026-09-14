import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/session";
import { getGoogleAuthUrl } from "@/lib/calendar/googleCalendarService";

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });

  const { url, isConfigured } = getGoogleAuthUrl(userId);

  if (!isConfigured || !url) {
    return NextResponse.json(
      {
        error: "Google Calendar OAuth credentials (GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET) are not set in environment.",
        code: "GOOGLE_NOT_CONFIGURED",
      },
      { status: 400 }
    );
  }

  return NextResponse.json({ url });
}
