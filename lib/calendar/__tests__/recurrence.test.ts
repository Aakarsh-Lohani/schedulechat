import { describe, expect, it } from "vitest";
import { buildRRule, formatRecurrenceLabel, formatTimeOfDay } from "../recurrence";

describe("recurrence utilities", () => {
  it("formats 24h time to 12h AM/PM correctly", () => {
    expect(formatTimeOfDay("19:00")).toBe("7:00 PM");
    expect(formatTimeOfDay("14:30")).toBe("2:30 PM");
    expect(formatTimeOfDay("08:00")).toBe("8:00 AM");
    expect(formatTimeOfDay("00:00")).toBe("12:00 AM");
    expect(formatTimeOfDay("12:00")).toBe("12:00 PM");
  });

  it("builds daily recurrence rule", () => {
    const rrule = buildRRule({ type: "daily" });
    expect(rrule).toBe("FREQ=DAILY");
    expect(formatRecurrenceLabel(rrule, "19:00")).toBe("Every day @ 7:00 PM");
  });

  it("builds weekdays recurrence rule", () => {
    const rrule = buildRRule({ type: "weekdays" });
    expect(rrule).toBe("FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR");
    expect(formatRecurrenceLabel(rrule, "14:30")).toBe("Mon-Fri @ 2:30 PM");
  });

  it("builds weekly recurrence rule for Sunday contest", () => {
    const rrule = buildRRule({ type: "weekly", daysOfWeek: [0] });
    expect(rrule).toBe("FREQ=WEEKLY;BYDAY=SU");
    expect(formatRecurrenceLabel(rrule, "08:00")).toBe("Every Sunday @ 8:00 AM");
  });

  it("builds biweekly recurrence rule for alternate Saturday LeetCode contest", () => {
    const rrule = buildRRule({ type: "biweekly", daysOfWeek: [6], intervalWeeks: 2 });
    expect(rrule).toBe("FREQ=WEEKLY;INTERVAL=2;BYDAY=SA");
    expect(formatRecurrenceLabel(rrule, "08:00")).toBe("Every alternate Sat @ 8:00 AM");
  });

  it("builds custom days recurrence rule (Mon, Wed, Fri meet at 2:30 PM)", () => {
    const rrule = buildRRule({ type: "custom", daysOfWeek: [1, 3, 5] });
    expect(rrule).toBe("FREQ=WEEKLY;BYDAY=MO,WE,FR");
    expect(formatRecurrenceLabel(rrule, "14:30")).toBe("Mon, Wed, Fri @ 2:30 PM");
  });
});
