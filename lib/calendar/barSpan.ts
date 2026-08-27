const DAY_MS = 24 * 60 * 60 * 1000;

export interface BarSpanInput {
  startDate: string | null;
  endDate: string | null;
  scheduledDate: string | null;
}

export interface BarSpan {
  /** 1-indexed CSS grid column to start the bar at. */
  start: number;
  /** How many day-columns the bar spans. */
  span: number;
}

/**
 * Computes where a task's bar sits on a 7-day week grid, clamped to the visible
 * week. Returns null if the task has no usable date, or its range falls entirely
 * outside the visible week.
 */
export function computeBarSpan(task: BarSpanInput, weekStart: Date, weekEnd: Date): BarSpan | null {
  const rawStart = task.startDate ?? task.scheduledDate;
  const rawEnd = task.endDate ?? task.scheduledDate ?? task.startDate;
  if (!rawStart || !rawEnd) return null;

  const start = new Date(rawStart);
  const end = new Date(rawEnd);
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);

  const clampedStart = Math.max(start.getTime(), weekStart.getTime());
  const clampedEnd = Math.min(end.getTime(), weekEnd.getTime());
  if (clampedEnd < clampedStart) return null;

  const startCol = Math.round((clampedStart - weekStart.getTime()) / DAY_MS) + 1;
  const span = Math.round((clampedEnd - clampedStart) / DAY_MS) + 1;
  return { start: startCol, span };
}

/**
 * Given a task's current start/end dates and a target day-index (0-6, Monday-first)
 * within the visible week, returns the new start/end ISO dates shifted so the task
 * keeps its original duration but begins on the target day.
 */
export function shiftTaskDates(
  task: BarSpanInput,
  weekStart: Date,
  targetDayIndex: number
): { startDate: string; endDate: string } {
  const rawStart = task.startDate ?? task.scheduledDate ?? new Date().toISOString();
  const rawEnd = task.endDate ?? task.scheduledDate ?? task.startDate ?? rawStart;

  const origStart = new Date(rawStart);
  const origEnd = new Date(rawEnd);
  origStart.setHours(0, 0, 0, 0);
  origEnd.setHours(0, 0, 0, 0);

  const durationDays = Math.round((origEnd.getTime() - origStart.getTime()) / DAY_MS);
  const newStart = new Date(weekStart.getTime() + targetDayIndex * DAY_MS);
  const newEnd = new Date(newStart.getTime() + durationDays * DAY_MS);

  return { startDate: newStart.toISOString(), endDate: newEnd.toISOString() };
}
