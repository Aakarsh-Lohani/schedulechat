import { connectDB } from "@/lib/db/connect";
import { User } from "@/lib/db/models/User";
import { encryptString, decryptString } from "@/lib/security/crypto";
import { logger } from "@/lib/logger";

const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v2/userinfo";
const GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3";

const SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

function getRedirectUri(): string {
  const base = process.env.NEXTAUTH_URL || "http://localhost:3000";
  return `${base}/api/calendar/google/callback`;
}

function getGoogleCredentials() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  return { clientId, clientSecret, isConfigured: Boolean(clientId && clientSecret) };
}

/**
 * Generates the Google OAuth 2.0 authorization URL requesting offline access
 * and calendar.events scope.
 */
export function getGoogleAuthUrl(userId: string): { url: string | null; isConfigured: boolean } {
  const { clientId, isConfigured } = getGoogleCredentials();
  if (!isConfigured || !clientId) {
    return { url: null, isConfigured: false };
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getRedirectUri(),
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    prompt: "consent",
    state: userId,
  });

  return { url: `${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`, isConfigured: true };
}

/**
 * Exchanges the OAuth authorization code for tokens, encrypts the refresh token,
 * and saves connection info to the user document.
 */
export async function handleOAuthCallback(code: string, userId: string): Promise<{ success: boolean; email?: string; error?: string }> {
  const { clientId, clientSecret, isConfigured } = getGoogleCredentials();
  if (!isConfigured || !clientId || !clientSecret) {
    return { success: false, error: "Google OAuth is not configured on the server." };
  }

  try {
    const tokenRes = await fetch(GOOGLE_TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: getRedirectUri(),
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      logger.error({ errText }, "failed to exchange google oauth code");
      return { success: false, error: "Failed to exchange authorization code with Google." };
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token as string;
    const refreshToken = tokenData.refresh_token as string;

    if (!refreshToken) {
      return { success: false, error: "Google did not provide a refresh token. Try reconnecting with prompt=consent." };
    }

    // Fetch user email
    const userInfoRes = await fetch(GOOGLE_USERINFO_ENDPOINT, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    let email = "";
    if (userInfoRes.ok) {
      const userInfo = await userInfoRes.json();
      email = userInfo.email ?? "";
    }

    // Encrypt refresh token at rest
    const encrypted = encryptString(refreshToken);

    await connectDB();
    await User.updateOne(
      { _id: userId },
      {
        googleCalendar: {
          connected: true,
          connectedEmail: email,
          encryptedRefreshToken: encrypted.ciphertext,
          iv: encrypted.iv,
          tag: encrypted.tag,
          connectedAt: new Date(),
        },
      }
    );

    logger.info({ userId, email }, "google calendar connected successfully");
    return { success: true, email };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "OAuth exchange failed";
    logger.error({ err, userId }, "google calendar oauth callback error");
    return { success: false, error: msg };
  }
}

/**
 * Retrieves a valid access token for the user by decrypting the refresh token
 * and refreshing with Google.
 */
export async function getValidAccessToken(userId: string): Promise<string | null> {
  const { clientId, clientSecret, isConfigured } = getGoogleCredentials();
  if (!isConfigured || !clientId || !clientSecret) return null;

  await connectDB();
  const user = await User.findById(userId).lean();
  const gc = user?.googleCalendar;
  if (!gc?.connected || !gc.encryptedRefreshToken || !gc.iv || !gc.tag) {
    return null;
  }

  try {
    const refreshToken = decryptString({
      ciphertext: gc.encryptedRefreshToken,
      iv: gc.iv,
      tag: gc.tag,
    });

    const res = await fetch(GOOGLE_TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!res.ok) {
      logger.warn({ userId }, "google token refresh failed");
      return null;
    }

    const data = await res.json();
    return data.access_token as string;
  } catch (err) {
    logger.error({ err, userId }, "error refreshing google calendar token");
    return null;
  }
}

/**
 * Checks whether the user has connected Google Calendar.
 */
export async function getGoogleCalendarStatus(userId: string): Promise<{
  isConfigured: boolean;
  connected: boolean;
  email?: string;
}> {
  const { isConfigured } = getGoogleCredentials();
  await connectDB();
  const user = await User.findById(userId).select("googleCalendar").lean();
  const gc = user?.googleCalendar;

  return {
    isConfigured,
    connected: Boolean(gc?.connected),
    email: gc?.connectedEmail ?? undefined,
  };
}

/**
 * Disconnects Google Calendar for the user and clears stored encrypted tokens.
 */
export async function disconnectGoogleCalendar(userId: string): Promise<boolean> {
  await connectDB();
  await User.updateOne(
    { _id: userId },
    {
      googleCalendar: {
        connected: false,
        connectedEmail: null,
        encryptedRefreshToken: null,
        iv: null,
        tag: null,
        connectedAt: null,
      },
    }
  );
  logger.info({ userId }, "google calendar disconnected");
  return true;
}

/**
 * Calculates start and end ISO datetime for the next occurrence of a recurring task.
 */
function calculateFirstOccurrence(startTime: string, durationMinutes: number): { startIso: string; endIso: string } {
  const [hStr, mStr] = startTime.split(":");
  const h = Number(hStr) || 0;
  const m = Number(mStr) || 0;

  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0);

  // If time already passed today, start from tomorrow
  if (start.getTime() < now.getTime()) {
    start.setDate(start.getDate() + 1);
  }

  const end = new Date(start.getTime() + durationMinutes * 60 * 1000);

  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  };
}

/**
 * Creates a recurring calendar event in the user's primary Google Calendar
 * with RFC 5545 RRULE and native popup reminder.
 */
export async function createRecurringGoogleEvent(
  userId: string,
  scheduledTask: {
    title: string;
    description?: string;
    startTime: string;
    durationMinutes: number;
    timezone?: string;
    recurrenceRule: string;
    reminderMinutes?: number;
  }
): Promise<string | null> {
  const accessToken = await getValidAccessToken(userId);
  if (!accessToken) return null;

  const tz = scheduledTask.timezone || "Asia/Kolkata";
  const { startIso, endIso } = calculateFirstOccurrence(scheduledTask.startTime, scheduledTask.durationMinutes);
  const reminderMins = scheduledTask.reminderMinutes ?? 10;

  const eventPayload = {
    summary: scheduledTask.title,
    description: scheduledTask.description ?? "",
    start: {
      dateTime: startIso,
      timeZone: tz,
    },
    end: {
      dateTime: endIso,
      timeZone: tz,
    },
    recurrence: [`RRULE:${scheduledTask.recurrenceRule}`],
    reminders: {
      useDefault: false,
      overrides: [{ method: "popup", minutes: reminderMins }],
    },
  };

  try {
    const res = await fetch(`${GOOGLE_CALENDAR_API}/calendars/primary/events`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(eventPayload),
    });

    if (!res.ok) {
      const errText = await res.text();
      logger.error({ errText, userId }, "failed to create recurring google calendar event");
      return null;
    }

    const createdEvent = await res.json();
    return createdEvent.id as string;
  } catch (err) {
    logger.error({ err, userId }, "error creating google calendar event");
    return null;
  }
}

/**
 * Updates an existing recurring event on Google Calendar.
 */
export async function updateRecurringGoogleEvent(
  userId: string,
  googleEventId: string,
  updates: {
    title?: string;
    description?: string;
    startTime?: string;
    durationMinutes?: number;
    timezone?: string;
    recurrenceRule?: string;
    reminderMinutes?: number;
  }
): Promise<boolean> {
  const accessToken = await getValidAccessToken(userId);
  if (!accessToken || !googleEventId) return false;

  const tz = updates.timezone || "Asia/Kolkata";
  const patchPayload: Record<string, unknown> = {};

  if (updates.title) patchPayload.summary = updates.title;
  if (updates.description !== undefined) patchPayload.description = updates.description;
  if (updates.recurrenceRule) patchPayload.recurrence = [`RRULE:${updates.recurrenceRule}`];
  if (updates.reminderMinutes !== undefined) {
    patchPayload.reminders = {
      useDefault: false,
      overrides: [{ method: "popup", minutes: updates.reminderMinutes }],
    };
  }

  if (updates.startTime && updates.durationMinutes) {
    const { startIso, endIso } = calculateFirstOccurrence(updates.startTime, updates.durationMinutes);
    patchPayload.start = { dateTime: startIso, timeZone: tz };
    patchPayload.end = { dateTime: endIso, timeZone: tz };
  }

  try {
    const res = await fetch(`${GOOGLE_CALENDAR_API}/calendars/primary/events/${encodeURIComponent(googleEventId)}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(patchPayload),
    });

    return res.ok;
  } catch (err) {
    logger.error({ err, userId, googleEventId }, "error updating google calendar event");
    return false;
  }
}

/**
 * Deletes an event from Google Calendar.
 */
export async function deleteGoogleEvent(userId: string, googleEventId: string): Promise<boolean> {
  const accessToken = await getValidAccessToken(userId);
  if (!accessToken || !googleEventId) return false;

  try {
    const res = await fetch(`${GOOGLE_CALENDAR_API}/calendars/primary/events/${encodeURIComponent(googleEventId)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    return res.ok || res.status === 404 || res.status === 410;
  } catch (err) {
    logger.error({ err, userId, googleEventId }, "error deleting google calendar event");
    return false;
  }
}
