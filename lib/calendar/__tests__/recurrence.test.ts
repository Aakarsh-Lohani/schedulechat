import { describe, expect, it } from "vitest";
import {
  buildRRule,
  formatRecurrenceLabel,
  formatTimeOfDay,
  parseRRule,
  doesRRuleOccurOnDate,
} from "../recurrence";

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

  it("parses RRULE strings back to RecurrenceConfig correctly", () => {
    const daily = parseRRule("FREQ=DAILY");
    expect(daily.type).toBe("daily");

    const weekdays = parseRRule("FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR");
    expect(weekdays.type).toBe("weekdays");

    const weeklySunday = parseRRule("FREQ=WEEKLY;BYDAY=SU");
    expect(weeklySunday.type).toBe("weekly");
    expect(weeklySunday.daysOfWeek).toEqual([0]);

    const biweeklySat = parseRRule("FREQ=WEEKLY;INTERVAL=2;BYDAY=SA");
    expect(biweeklySat.type).toBe("biweekly");
    expect(biweeklySat.daysOfWeek).toEqual([6]);
  });

  it("evaluates whether RRULE occurs on a specific target date", () => {
    // 2026-09-09 is a Wednesday (day 3)
    const wednesday = new Date(2026, 8, 9);
    // 2026-09-13 is a Sunday (day 0)
    const sunday = new Date(2026, 8, 13);
    // 2026-09-12 is a Saturday (day 6)
    const saturday = new Date(2026, 8, 12);

    expect(doesRRuleOccurOnDate("FREQ=DAILY", wednesday)).toBe(true);
    expect(doesRRuleOccurOnDate("FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", wednesday)).toBe(true);
    expect(doesRRuleOccurOnDate("FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", sunday)).toBe(false);
    expect(doesRRuleOccurOnDate("FREQ=WEEKLY;BYDAY=SU", sunday)).toBe(true);
    expect(doesRRuleOccurOnDate("FREQ=WEEKLY;BYDAY=SU", wednesday)).toBe(false);
    expect(doesRRuleOccurOnDate("FREQ=WEEKLY;BYDAY=MO,WE,FR", wednesday)).toBe(true);
    expect(doesRRuleOccurOnDate("FREQ=WEEKLY;BYDAY=MO,WE,FR", saturday)).toBe(false);
  });
});
