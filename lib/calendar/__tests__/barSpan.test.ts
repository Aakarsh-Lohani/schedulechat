import { describe, expect, it } from "vitest";
import { computeBarSpan, shiftTaskDates } from "../barSpan";

// A fixed Monday-start week: Mon Jun 1 2026 .. Sun Jun 7 2026.
const weekStart = new Date("2026-06-01T00:00:00.000Z");
const weekEnd = new Date("2026-06-07T23:59:59.999Z");

describe("computeBarSpan", () => {
  it("returns null when there is no usable date", () => {
    expect(computeBarSpan({ startDate: null, endDate: null, scheduledDate: null }, weekStart, weekEnd)).toBeNull();
  });

  it("positions a single-day task on scheduledDate alone", () => {
    const span = computeBarSpan(
      { startDate: null, endDate: null, scheduledDate: "2026-06-03T00:00:00.000Z" },
      weekStart,
      weekEnd
    );
    expect(span).toEqual({ start: 3, span: 1 });
  });

  it("spans multiple days for a start/end range fully inside the week", () => {
    const span = computeBarSpan(
      { startDate: "2026-06-02T00:00:00.000Z", endDate: "2026-06-04T00:00:00.000Z", scheduledDate: null },
      weekStart,
      weekEnd
    );
    expect(span).toEqual({ start: 2, span: 3 });
  });

  it("clamps a range that starts before the visible week", () => {
    const span = computeBarSpan(
      { startDate: "2026-05-28T00:00:00.000Z", endDate: "2026-06-02T00:00:00.000Z", scheduledDate: null },
      weekStart,
      weekEnd
    );
    expect(span).toEqual({ start: 1, span: 2 });
  });

  it("returns null when the range falls entirely outside the visible week", () => {
    const span = computeBarSpan(
      { startDate: "2026-05-01T00:00:00.000Z", endDate: "2026-05-05T00:00:00.000Z", scheduledDate: null },
      weekStart,
      weekEnd
    );
    expect(span).toBeNull();
  });
});

describe("shiftTaskDates", () => {
  it("preserves duration when shifting to a new start day", () => {
    const result = shiftTaskDates(
      { startDate: "2026-06-02T00:00:00.000Z", endDate: "2026-06-04T00:00:00.000Z", scheduledDate: null },
      weekStart,
      4 // Friday, 0-indexed from Monday
    );
    expect(result.startDate.slice(0, 10)).toBe("2026-06-05");
    expect(result.endDate.slice(0, 10)).toBe("2026-06-07");
  });

  it("keeps a single-day task single-day when shifted", () => {
    const result = shiftTaskDates(
      { startDate: null, endDate: null, scheduledDate: "2026-06-03T00:00:00.000Z" },
      weekStart,
      0
    );
    expect(result.startDate.slice(0, 10)).toBe(result.endDate.slice(0, 10));
    expect(result.startDate.slice(0, 10)).toBe("2026-06-01");
  });
});
