/**
 * Analytics math and aggregation helpers
 */

export function computeOverlapSeconds(
  startedAt: Date,
  endedAt: Date | null,
  plannedSec: number,
  windowStart: Date,
  windowEnd: Date
): number {
  const sStart = startedAt.getTime();
  const effectiveEnd = endedAt
    ? endedAt.getTime()
    : Math.min(Date.now(), sStart + plannedSec * 1000);

  const overlapStart = Math.max(sStart, windowStart.getTime());
  const overlapEnd = Math.min(effectiveEnd, windowEnd.getTime());

  if (overlapEnd <= overlapStart) return 0;
  return Math.floor((overlapEnd - overlapStart) / 1000);
}

export interface OverrunResult {
  isOverrun: boolean;
  overrunSeconds: number;
  overrunMinutes: number;
  percentOfEstimate: number;
}

export function calculateOverrun(estimateMinutes: number, trackedSeconds: number): OverrunResult {
  const estSec = Math.max(0, estimateMinutes * 60);
  const isOverrun = trackedSeconds > estSec;
  const overrunSeconds = isOverrun ? trackedSeconds - estSec : 0;
  const percentOfEstimate = estSec > 0 ? Math.round((trackedSeconds / estSec) * 100) : 100;

  return {
    isOverrun,
    overrunSeconds,
    overrunMinutes: Math.round(overrunSeconds / 60),
    percentOfEstimate,
  };
}

export function formatTimeUsage(seconds: number): string {
  const totalMins = Math.floor(seconds / 60);
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;

  if (hours === 0) {
    return `${mins}m`;
  }
  if (mins === 0) {
    return `${hours}h`;
  }
  return `${hours}h ${mins}m`;
}
