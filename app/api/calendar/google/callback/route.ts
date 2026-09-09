import { NextResponse } from "next/server";
import { handleOAuthCallback } from "@/lib/calendar/googleCalendarService";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const stateUserId = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";

  if (error || !code || !stateUserId) {
    return NextResponse.redirect(`${baseUrl}/?calendarError=${encodeURIComponent(error || "missing_code")}`);
  }

  const result = await handleOAuthCallback(code, stateUserId);

  if (!result.success) {
    return NextResponse.redirect(`${baseUrl}/?calendarError=${encodeURIComponent(result.error || "connection_failed")}`);
  }

  return NextResponse.redirect(`${baseUrl}/?calendarConnected=true`);
}
