export type BudgetColor = "green" | "orange" | "red";

export interface BudgetThresholds {
  /** ratio (tracked/estimate) at/above which the bar turns orange */
  warn: number;
  /** ratio at/above which the bar turns red */
  over: number;
}

export const DEFAULT_THRESHOLDS: BudgetThresholds = { warn: 1.0, over: 1.3 };

export interface BudgetStatus {
  ratio: number;
  color: BudgetColor;
  overSeconds: number;
  fillPercent: number; // 0-100, capped for rendering the base bar
}

/**
 * Pure function: given seconds already tracked against a task and its estimate,
 * returns the color and overflow amount for the budget bar. No I/O, no Date.now().
 */
export function budgetStatus(
  totalTrackedSeconds: number,
  estimateMinutes: number,
  thresholds: BudgetThresholds = DEFAULT_THRESHOLDS
): BudgetStatus {
  const estimateSeconds = Math.max(0, estimateMinutes) * 60;
  const ratio = estimateSeconds === 0 ? 0 : totalTrackedSeconds / estimateSeconds;
  const color: BudgetColor = ratio < thresholds.warn ? "green" : ratio < thresholds.over ? "orange" : "red";
  const overSeconds = Math.max(0, totalTrackedSeconds - estimateSeconds);
  const fillPercent = Math.min(100, Math.round(ratio * 100));
  return { ratio, color, overSeconds, fillPercent };
}

/** Formats seconds as "1h 24m" / "24m" / "45s", used across timers + budget labels. */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${sec}s`;
}

/** Formats seconds as a countdown clock "18:42". */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}
