import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/session";
import { verifyOAuthStateToken } from "@/lib/security/crypto";
import { handleOAuthCallback } from "@/lib/calendar/googleCalendarService";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const rawState = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";

  if (error || !code || !rawState) {
    return NextResponse.redirect(`${baseUrl}/?calendarError=${encodeURIComponent(error || "missing_code")}`);
  }

  // 1. Verify HMAC-signed state token to prevent CSRF
  const stateUserId = verifyOAuthStateToken(rawState);
  if (!stateUserId) {
    return NextResponse.redirect(`${baseUrl}/?calendarError=${encodeURIComponent("invalid_state")}`);
  }

  // 2. Verify the user is authenticated
  const sessionUserId = await getCurrentUserId();
  if (!sessionUserId) {
    return NextResponse.redirect(`${baseUrl}/?calendarError=${encodeURIComponent("unauthorized")}`);
  }

  // 3. Cross-check: the state userId must match the authenticated user
  if (stateUserId !== sessionUserId) {
    return NextResponse.redirect(`${baseUrl}/?calendarError=${encodeURIComponent("state_mismatch")}`);
  }

  const result = await handleOAuthCallback(code, stateUserId);

  if (!result.success) {
    return NextResponse.redirect(`${baseUrl}/?calendarError=${encodeURIComponent(result.error || "connection_failed")}`);
  }

  return NextResponse.redirect(`${baseUrl}/?calendarConnected=true`);
}
