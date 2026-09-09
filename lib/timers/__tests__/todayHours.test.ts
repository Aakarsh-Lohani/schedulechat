import { describe, expect, it } from "vitest";
import { calculateTodayBoundedSeconds, formatDuration } from "../budget";

describe("calculateTodayBoundedSeconds", () => {
  it("strictly caps today total at 24 hours (86,400 seconds)", () => {
    const todayMidnight = new Date("2026-09-09T00:00:00Z").getTime();
    const now = new Date("2026-09-09T12:00:00Z").getTime(); // midday

    // Even if base has an erroneous large number or live session ran long
    const result = calculateTodayBoundedSeconds(
      100_000, // already exceeds 24h
      [],
      now,
      todayMidnight
    );

    expect(result.todayTotalSeconds).toBe(86400); // exactly 24h max
  });

  it("never computes 194 hours for multi-day running sessions", () => {
    const todayMidnight = new Date("2026-09-09T00:00:00Z").getTime();
    const now = new Date("2026-09-09T02:00:00Z").getTime(); // 2 hours after midnight

    // Session started 8 days ago (approx 192+ hours ago)
    const eightDaysAgo = todayMidnight - 8 * 24 * 60 * 60 * 1000;

    const result = calculateTodayBoundedSeconds(
      0,
      [
        {
          startedAt: eightDaysAgo,
          plannedDurationSeconds: 1800, // 30 mins
          extendedBySeconds: 0,
        },
      ],
      now,
      todayMidnight
    );

    // Bounded by maxDuration (30 mins = 1800s), NOT 194 hours!
    expect(result.todayTotalSeconds).toBe(1800);
    expect(result.todayTotalSeconds).toBeLessThanOrEqual(86400);
    expect(formatDuration(result.todayTotalSeconds)).toBe("30m");
  });

  it("accurately accumulates today's elapsed seconds for sessions started today", () => {
    const todayMidnight = new Date("2026-09-09T00:00:00Z").getTime();
    const sessionStart = todayMidnight + 2 * 3600 * 1000; // 2:00 AM
    const now = sessionStart + 15 * 60 * 1000 + 5 * 1000; // 15 mins + 5s countdown later

    const result = calculateTodayBoundedSeconds(
      3600, // 1 hour completed earlier today
      [
        {
          startedAt: sessionStart,
          plannedDurationSeconds: 1800, // 30 mins
          extendedBySeconds: 0,
        },
      ],
      now,
      todayMidnight
    );

    // 1 hour (3600s) + 15 mins (900s) = 4500s = 1h 15m
    expect(result.todayTotalSeconds).toBe(4500);
    expect(formatDuration(result.todayTotalSeconds)).toBe("1h 15m");
  });
});
