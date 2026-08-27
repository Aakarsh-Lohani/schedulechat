import { describe, expect, it } from "vitest";
import { budgetStatus, formatClock, formatDuration } from "../budget";

describe("budgetStatus", () => {
  it("is green under the warn threshold", () => {
    const result = budgetStatus(10 * 60, 30); // 10m tracked of 30m estimate
    expect(result.color).toBe("green");
    expect(result.overSeconds).toBe(0);
    expect(result.fillPercent).toBe(33);
  });

  it("is orange between warn and over thresholds", () => {
    const result = budgetStatus(35 * 60, 30); // 35/30 = 116%
    expect(result.color).toBe("orange");
    expect(result.overSeconds).toBe(5 * 60);
  });

  it("is red at or beyond the over threshold", () => {
    const result = budgetStatus(45 * 60, 30); // 45/30 = 150%
    expect(result.color).toBe("red");
    expect(result.overSeconds).toBe(15 * 60);
  });

  it("caps fillPercent at 100 even when far over budget", () => {
    const result = budgetStatus(120 * 60, 30);
    expect(result.fillPercent).toBe(100);
  });

  it("treats a zero estimate as green with no overflow", () => {
    const result = budgetStatus(600, 0);
    expect(result.color).toBe("green");
    expect(result.ratio).toBe(0);
  });

  it("respects custom thresholds", () => {
    const result = budgetStatus(20 * 60, 30, { warn: 0.5, over: 0.9 }); // ratio ~0.67
    expect(result.color).toBe("orange");
  });
});

describe("formatDuration", () => {
  it("formats sub-minute durations as seconds", () => {
    expect(formatDuration(45)).toBe("45s");
  });
  it("formats sub-hour durations as minutes", () => {
    expect(formatDuration(25 * 60)).toBe("25m");
  });
  it("formats durations over an hour as hours + minutes", () => {
    expect(formatDuration(90 * 60)).toBe("1h 30m");
  });
});

describe("formatClock", () => {
  it("pads minutes and seconds", () => {
    expect(formatClock(65)).toBe("01:05");
  });
  it("floors negative input at zero", () => {
    expect(formatClock(-30)).toBe("00:00");
  });
});
