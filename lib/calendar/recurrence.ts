export type RecurrenceType = "daily" | "weekdays" | "weekly" | "biweekly" | "custom";

export interface RecurrenceConfig {
  type: RecurrenceType;
  // Day of week numbers: 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  daysOfWeek?: number[];
  intervalWeeks?: number;
}

const DAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
const DAY_NAMES_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/**
 * Builds an RFC 5545 RRULE string from a recurrence configuration.
 * Examples:
 * - Daily: "FREQ=DAILY"
 * - Weekdays: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR"
 * - Every Sunday: "FREQ=WEEKLY;BYDAY=SU"
 * - Every alternate Saturday: "FREQ=WEEKLY;INTERVAL=2;BYDAY=SA"
 * - Mon, Wed, Fri: "FREQ=WEEKLY;BYDAY=MO,WE,FR"
 */
export function buildRRule(config: RecurrenceConfig): string {
  switch (config.type) {
    case "daily":
      return "FREQ=DAILY";
    case "weekdays":
      return "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR";
    case "weekly": {
      const day = config.daysOfWeek?.[0] ?? 0;
      return `FREQ=WEEKLY;BYDAY=${DAY_CODES[day]}`;
    }
    case "biweekly": {
      const day = config.daysOfWeek?.[0] ?? 6; // default Saturday
      const interval = config.intervalWeeks ?? 2;
      return `FREQ=WEEKLY;INTERVAL=${interval};BYDAY=${DAY_CODES[day]}`;
    }
    case "custom": {
      const days = (config.daysOfWeek && config.daysOfWeek.length > 0) ? config.daysOfWeek : [1];
      const byDay = days.map((d) => DAY_CODES[d]).join(",");
      return `FREQ=WEEKLY;BYDAY=${byDay}`;
    }
    default:
      return "FREQ=DAILY";
  }
}

/**
 * Generates a human-readable label for a recurrence rule and time.
 * Examples:
 * - "Every day @ 7:00 PM"
 * - "Mon, Wed, Fri @ 2:30 PM"
 * - "Every Sunday @ 8:00 AM"
 * - "Every alternate Saturday @ 8:00 AM (LeetCode Contest)"
 */
export function formatRecurrenceLabel(rrule: string, startTime: string): string {
  const formattedTime = formatTimeOfDay(startTime);

  if (rrule.includes("FREQ=DAILY")) {
    return `Every day @ ${formattedTime}`;
  }

  if (rrule.includes("BYDAY=MO,TU,WE,TH,FR")) {
    return `Mon-Fri @ ${formattedTime}`;
  }

  const intervalMatch = rrule.match(/INTERVAL=(\d+)/);
  const interval = intervalMatch ? Number(intervalMatch[1]) : 1;

  const byDayMatch = rrule.match(/BYDAY=([A-Z,]+)/);
  if (byDayMatch && byDayMatch[1]) {
    const matchedDayGroup = byDayMatch[1];
    const codes = matchedDayGroup.split(",");
    const dayLabels = codes.map((c) => {
      const idx = DAY_CODES.indexOf(c as typeof DAY_CODES[number]);
      return idx >= 0 ? (DAY_NAMES_SHORT[idx] ?? c) : c;
    });

    if (interval === 2) {
      return `Every alternate ${dayLabels.join(", ")} @ ${formattedTime}`;
    }

    if (dayLabels.length === 1 && codes[0]) {
      const firstCode = codes[0];
      const codeIdx = DAY_CODES.indexOf(firstCode as typeof DAY_CODES[number]);
      const fullDay = (codeIdx >= 0 ? DAY_NAMES[codeIdx] : null) ?? dayLabels[0];
      return `Every ${fullDay} @ ${formattedTime}`;
    }

    return `${dayLabels.join(", ")} @ ${formattedTime}`;
  }

  return `${rrule} @ ${formattedTime}`;
}

/**
 * Formats "HH:mm" 24h time to "h:mm A" (e.g. "19:00" -> "7:00 PM", "08:30" -> "8:30 AM")
 */
export function formatTimeOfDay(time24: string): string {
  const [hStr, mStr] = time24.split(":");
  let h = Number(hStr);
  const m = Number(mStr);
  if (isNaN(h) || isNaN(m)) return time24;

  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  const mFormatted = String(m).padStart(2, "0");
  return `${h}:${mFormatted} ${ampm}`;
}
