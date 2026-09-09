import { describe, expect, it } from "vitest";
import {
  computeOverlapSeconds,
  calculateOverrun,
  formatTimeUsage,
} from "../metrics";

describe("analytics metrics helpers", () => {
  describe("computeOverlapSeconds", () => {
    const windowStart = new Date("2026-09-09T00:00:00Z");
    const windowEnd = new Date("2026-09-09T23:59:59Z");

    it("returns full session duration when session is completely inside the window", () => {
      const start = new Date("2026-09-09T10:00:00Z");
      const end = new Date("2026-09-09T11:30:00Z");
      const overlap = computeOverlapSeconds(start, end, 5400, windowStart, windowEnd);
      expect(overlap).toBe(5400); // 90 minutes = 5400s
    });

    it("returns clipped duration when session started before window and ended inside", () => {
      const start = new Date("2026-09-08T23:00:00Z"); // 1 hour before midnight
      const end = new Date("2026-09-09T01:00:00Z"); // 1 hour after midnight
      const overlap = computeOverlapSeconds(start, end, 7200, windowStart, windowEnd);
      expect(overlap).toBe(3600); // exactly 1 hour inside today
    });

    it("returns clipped duration when session started inside window and ended after", () => {
      const start = new Date("2026-09-09T23:00:00Z"); // 1 hour before midnight
      const end = new Date("2026-09-10T01:00:00Z"); // 1 hour next day
      const overlap = computeOverlapSeconds(start, end, 7200, windowStart, windowEnd);
      // Window ends at 23:59:59 (3599 seconds overlap)
      expect(overlap).toBe(3599);
    });

    it("returns 0 when session occurred entirely before or after window", () => {
      const pastStart = new Date("2026-09-07T10:00:00Z");
      const pastEnd = new Date("2026-09-07T11:00:00Z");
      expect(computeOverlapSeconds(pastStart, pastEnd, 3600, windowStart, windowEnd)).toBe(0);

      const futureStart = new Date("2026-09-11T10:00:00Z");
      const futureEnd = new Date("2026-09-11T11:00:00Z");
      expect(computeOverlapSeconds(futureStart, futureEnd, 3600, windowStart, windowEnd)).toBe(0);
    });

    it("handles live session with null endedAt", () => {
      // Session started 30 mins ago inside window
      const nowMs = Date.now();
      const start = new Date(nowMs - 30 * 60 * 1000);
      const winStart = new Date(nowMs - 60 * 60 * 1000);
      const winEnd = new Date(nowMs + 60 * 60 * 1000);

      const overlap = computeOverlapSeconds(start, null, 3600, winStart, winEnd);
      // Expected ~30 minutes (allow small drift)
      expect(overlap).toBeGreaterThanOrEqual(1790);
      expect(overlap).toBeLessThanOrEqual(1810);
    });
  });

  describe("calculateOverrun", () => {
    it("reports not overrun when tracked time is within estimate", () => {
      const result = calculateOverrun(60, 2400); // estimate 60m, tracked 40m (2400s)
      expect(result.isOverrun).toBe(false);
      expect(result.overrunSeconds).toBe(0);
      expect(result.overrunMinutes).toBe(0);
      expect(result.percentOfEstimate).toBe(67);
    });

    it("reports overrun and exact excess when tracked time exceeds estimate", () => {
      const result = calculateOverrun(45, 3600); // estimate 45m (2700s), tracked 60m (3600s)
      expect(result.isOverrun).toBe(true);
      expect(result.overrunSeconds).toBe(900); // 15 mins excess
      expect(result.overrunMinutes).toBe(15);
      expect(result.percentOfEstimate).toBe(133);
    });

    it("handles zero estimate gracefully", () => {
      const result = calculateOverrun(0, 1800);
      expect(result.isOverrun).toBe(true);
      expect(result.overrunMinutes).toBe(30);
      expect(result.percentOfEstimate).toBe(100);
    });
  });

  describe("formatTimeUsage", () => {
    it("formats minutes only when under 1 hour", () => {
      expect(formatTimeUsage(45 * 60)).toBe("45m");
    });

    it("formats exact hours", () => {
      expect(formatTimeUsage(2 * 3600)).toBe("2h");
    });

    it("formats hours and minutes", () => {
      expect(formatTimeUsage(2 * 3600 + 25 * 60)).toBe("2h 25m");
    });
  });
});
