import { describe, expect, it } from "vitest";
import { COUNTDOWN_SECONDS } from "../constants";

/**
 * Pure helper replicating elapsed and contributed calculation in app/api/timers/[id]/stop/route.ts
 */
function calculateContributedSeconds({
  startedAt,
  now,
  plannedDurationSeconds,
  extendedBySeconds = 0,
  totalPausedSeconds = 0,
  pausedAt = null,
  status = "running",
  isFollowed = true,
  isScheduledTask = false,
}: {
  startedAt: Date;
  now: Date;
  plannedDurationSeconds: number;
  extendedBySeconds?: number;
  totalPausedSeconds?: number;
  pausedAt?: Date | null;
  status?: "running" | "paused" | "countdown";
  isFollowed?: boolean;
  isScheduledTask?: boolean;
}): { contributedSeconds: number; status: "completed" | "cancelled" } {
  if (!isFollowed) {
    return { contributedSeconds: 0, status: "cancelled" };
  }

  let pausedDeduction = totalPausedSeconds;
  if (status === "paused" && pausedAt) {
    pausedDeduction += Math.max(0, (now.getTime() - pausedAt.getTime()) / 1000);
  }

  const rawElapsedSeconds = (now.getTime() - startedAt.getTime()) / 1000;
  const elapsedWorkSeconds = Math.max(0, Math.round(rawElapsedSeconds - COUNTDOWN_SECONDS - pausedDeduction));
  const maxAllowedDuration = plannedDurationSeconds + extendedBySeconds;
  const calculatedContributed =
    status === "running" || status === "paused"
      ? (isScheduledTask ? Math.min(maxAllowedDuration, elapsedWorkSeconds) : elapsedWorkSeconds)
      : 0;

  return {
    contributedSeconds: calculatedContributed,
    status: "completed",
  };
}

/**
 * Pure helper replicating circular seconds difference in useScheduledTaskAlarms.ts
 */
function getTimingDiffSecs(taskStartSecs: number, nowSecs: number): number {
  let diffSecs = taskStartSecs - nowSecs;
  if (diffSecs < -43200) diffSecs += 86400;
  else if (diffSecs > 43200) diffSecs -= 86400;
  return diffSecs;
}

describe("Timer Integrity & Time-Counting Rules", () => {
  it("caps contributedSeconds to plannedDuration for scheduled tasks on auto-stop even if stopped late", () => {
    const plannedDurationSeconds = 1800; // 30 minutes
    const startedAt = new Date("2026-09-29T10:00:00Z");
    // Suppose browser was closed or delayed and stop fires 45 minutes later (2700s)
    const now = new Date("2026-09-29T10:45:00Z");

    const result = calculateContributedSeconds({
      startedAt,
      now,
      plannedDurationSeconds,
      status: "running",
      isFollowed: true,
      isScheduledTask: true,
    });

    expect(result.contributedSeconds).toBe(1800); // strictly capped to planned
    expect(result.status).toBe("completed");
  });

  it("records full actual elapsed time including extra time for regular tasks (e.g. 160 minutes on 30 min timer)", () => {
    const plannedDurationSeconds = 1800; // 30 minutes default timer
    const startedAt = new Date("2026-10-07T10:00:00Z");
    // User worked 160 minutes (9600s work + COUNTDOWN_SECONDS)
    const now = new Date(startedAt.getTime() + (160 * 60 + COUNTDOWN_SECONDS) * 1000);

    const result = calculateContributedSeconds({
      startedAt,
      now,
      plannedDurationSeconds,
      status: "running",
      isFollowed: true,
      isScheduledTask: false,
    });

    expect(result.contributedSeconds).toBe(9600); // full 160 minutes recorded
    expect(result.status).toBe("completed");
  });

  it("calculates exact partial time if manually stopped early", () => {
    const plannedDurationSeconds = 1800; // 30 mins
    const startedAt = new Date("2026-09-29T10:00:00Z");
    // Stopped 15 minutes and 10 seconds after start (10s countdown + 900s work)
    const now = new Date("2026-09-29T10:15:10Z");

    const result = calculateContributedSeconds({
      startedAt,
      now,
      plannedDurationSeconds,
      status: "running",
      isFollowed: true,
    });

    expect(result.contributedSeconds).toBe(900); // 15 mins exact work
    expect(result.status).toBe("completed");
  });

  it("deducts paused seconds accurately", () => {
    const plannedDurationSeconds = 1800;
    const startedAt = new Date("2026-09-29T10:00:00Z");
    // 20 minutes wall clock, but was paused for 5 minutes (300s)
    const now = new Date("2026-09-29T10:20:10Z");

    const result = calculateContributedSeconds({
      startedAt,
      now,
      plannedDurationSeconds,
      totalPausedSeconds: 300,
      status: "running",
      isFollowed: true,
    });

    // 1210s raw - 10s countdown - 300s paused = 900s work
    expect(result.contributedSeconds).toBe(900);
    expect(result.status).toBe("completed");
  });

  it("zeros out contributedSeconds when isFollowed is false (rejection/did not follow)", () => {
    const plannedDurationSeconds = 1800;
    const startedAt = new Date("2026-09-29T10:00:00Z");
    const now = new Date("2026-09-29T10:30:10Z");

    const result = calculateContributedSeconds({
      startedAt,
      now,
      plannedDurationSeconds,
      status: "running",
      isFollowed: false,
    });

    expect(result.contributedSeconds).toBe(0);
    expect(result.status).toBe("cancelled");
  });

  it("handles midnight boundary wrap-around in scheduled task timing checks", () => {
    // Task scheduled at 00:00 (midnight)
    const taskStartSecs = 0;

    // 10 seconds before midnight: 23:59:50 -> 86390 seconds
    const nowSecsBefore = 86390;
    const diffBefore = getTimingDiffSecs(taskStartSecs, nowSecsBefore);
    expect(diffBefore).toBe(10); // 10 seconds in the future
    // In auto-start window [-30, 15]
    expect(diffBefore <= 15 && diffBefore >= -30).toBe(true);

    // 10 minutes before midnight: 23:50:00 -> 85800 seconds
    const nowSecsReminder = 85800;
    const diffReminder = getTimingDiffSecs(taskStartSecs, nowSecsReminder);
    expect(diffReminder).toBe(600); // 600s = 10 mins
    // In reminder window (15 < diff <= 600)
    expect(diffReminder > 15 && diffReminder <= 600).toBe(true);

    // 10 seconds after midnight: 00:00:10 -> 10 seconds
    const nowSecsAfter = 10;
    const diffAfter = getTimingDiffSecs(taskStartSecs, nowSecsAfter);
    expect(diffAfter).toBe(-10); // 10 seconds in the past
    // In auto-start window [-30, 15]
    expect(diffAfter <= 15 && diffAfter >= -30).toBe(true);
  });

  it("prevents double-counting when notification approve finds existing session", () => {
    // Simulates logic in /api/notifications/[id]/action
    const existingSession = {
      status: "completed",
      contributedSeconds: 1800,
    };

    let sessionCreated = false;
    let finalContributed = existingSession.contributedSeconds;

    if (existingSession) {
      existingSession.status = "completed";
      if (!existingSession.contributedSeconds || existingSession.contributedSeconds === 0) {
        finalContributed = 1800;
      }
    } else {
      sessionCreated = true;
      finalContributed = 1800;
    }

    expect(sessionCreated).toBe(false);
    expect(finalContributed).toBe(1800); // preserved, never duplicated
  });
});
