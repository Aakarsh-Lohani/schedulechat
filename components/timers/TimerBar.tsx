"use client";

import { useDroppable } from "@dnd-kit/core";
import { useEffect, useRef, useState } from "react";
import { signOut } from "next-auth/react";
import {
  useActiveTimers,
  useCancelTimer,
  useConfirmStartTimer,
  useExtendTimer,
  useStopTimer,
} from "@/lib/api/hooks";
import { formatClock, formatDuration } from "@/lib/timers/budget";
import { COUNTDOWN_SECONDS } from "@/lib/timers/constants";
import type { TimerSlotDTO } from "@/lib/api/types";
import styles from "./TimerBar.module.scss";

function useNowTick(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function SlotView({
  slot,
  session,
  now,
}: {
  slot: 1 | 2;
  session: TimerSlotDTO | null;
  now: number;
}) {
  const confirmStart = useConfirmStartTimer();
  const cancelTimer = useCancelTimer();
  const extendTimer = useExtendTimer();
  const stopTimer = useStopTimer();
  const { setNodeRef, isOver: isDropTarget } = useDroppable({
    id: `timer:${slot}`,
    disabled: !!session,
  });

  // Guard ref to ensure confirm-start fires exactly once per session
  const confirmedRef = useRef<string | null>(null);

  const sessionId = session?.id ?? null;
  const sessionStatus = session?.status ?? null;
  const isCountdown = sessionStatus === "countdown";
  const startedAtMs = session?.startedAt ? new Date(session.startedAt).getTime() : 0;
  const endsAtMs = session?.countdownEndsAt
    ? new Date(session.countdownEndsAt).getTime()
    : startedAtMs + COUNTDOWN_SECONDS * 1000;

  const remaining = isCountdown ? Math.max(0, Math.round((endsAtMs - now) / 1000)) : 0;

  // Unconditional countdown expiration effect
  useEffect(() => {
    if (isCountdown && sessionId && remaining === 0 && confirmedRef.current !== sessionId) {
      confirmedRef.current = sessionId;
      confirmStart.mutate(sessionId);
    }
  }, [isCountdown, sessionId, remaining, confirmStart]);

  // Reset confirmedRef when session is cleared or changes
  useEffect(() => {
    if (!sessionId || !isCountdown) {
      if (confirmedRef.current && confirmedRef.current !== sessionId) {
        confirmedRef.current = null;
      }
    }
  }, [sessionId, isCountdown]);

  if (!session) {
    return (
      <div ref={setNodeRef} className={`${styles.slot} ${isDropTarget ? styles.dropTarget : ""}`}>
        <div className={styles.idle}>Timer {slot} · drag a task here</div>
      </div>
    );
  }

  if (session.status === "countdown") {
    return (
      <div ref={setNodeRef} className={styles.slot}>
        <div className={styles.ring} />
        <div className={styles.meta}>
          <span className={styles.label}>Timer {slot} · starting…</span>
          <span className={styles.taskName}>{session.taskTitle}</span>
          <span className={styles.value}>in {remaining}s</span>
        </div>
        <div className={styles.actions}>
          <button className={styles.miniBtn} onClick={() => cancelTimer.mutate(session.id)}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  const workElapsedSeconds = Math.max(0, (now - startedAtMs) / 1000 - COUNTDOWN_SECONDS);
  const plannedTotal = session.plannedDurationSeconds + session.extendedBySeconds;
  const remainingRunning = plannedTotal - workElapsedSeconds;
  const isOver = remainingRunning <= 0;

  return (
    <div ref={setNodeRef} className={`${styles.slot} ${isOver ? styles.over : ""}`}>
      <div className={styles.ring} />
      <div className={styles.meta}>
        <span className={styles.label}>Timer {slot}</span>
        <span className={styles.taskName}>{session.taskTitle}</span>
        <span className={styles.value}>
          {isOver ? `+${formatClock(-remainingRunning)} over` : `${formatClock(remainingRunning)} remaining`}
        </span>
      </div>
      <div className={styles.actions}>
        {isOver && (
          <button className={styles.miniBtn} onClick={() => extendTimer.mutate({ id: session.id, seconds: 600 })}>
            +10m
          </button>
        )}
        <button className={styles.miniBtn} onClick={() => stopTimer.mutate(session.id)}>
          Stop
        </button>
      </div>
    </div>
  );
}

export function TimerBar() {
  const { data } = useActiveTimers();
  const now = useNowTick();

  let liveSecondsToday = 0;
  let liveSecondsTotal = 0;
  const todayMidnightMs = new Date().setHours(0, 0, 0, 0);

  if (data) {
    for (const key of ["1", "2"] as const) {
      const s = data.slots[key];
      if (s && s.status === "running") {
        const startedAtMs = new Date(s.startedAt).getTime();
        const maxDurationSeconds = s.plannedDurationSeconds + s.extendedBySeconds;

        // Total live elapsed across whole session, capped by planned duration + extensions
        const totalElapsed = Math.min(
          maxDurationSeconds,
          Math.max(0, (now - startedAtMs) / 1000 - COUNTDOWN_SECONDS)
        );
        liveSecondsTotal += totalElapsed;

        // Compute overlap of timer's work window with today
        const workStartMs = startedAtMs + COUNTDOWN_SECONDS * 1000;
        const expectedEndMs = workStartMs + maxDurationSeconds * 1000;
        const actualEndMs = Math.min(now, expectedEndMs);
        const overlapStartMs = Math.max(workStartMs, todayMidnightMs);
        const overlapMs = Math.max(0, actualEndMs - overlapStartMs);
        liveSecondsToday += overlapMs / 1000;
      }
    }
  }

  // Today's total is strictly capped between 0 and 24 hours (86,400s)
  const todayTotal = Math.min(86400, Math.max(0, (data?.completedSecondsTodayBase ?? 0) + liveSecondsToday));
  const allTimeTotal = Math.max(0, (data?.totalUsageSeconds ?? 0) + liveSecondsTotal);

  return (
    <div className={styles.topbar}>
      <div className={styles.brandRow}>
        <div className={styles.brand}>
          Schedule<span>Chat</span>
        </div>
        <button
          type="button"
          className={styles.signOutBtn}
          onClick={() => signOut({ callbackUrl: "/login" })}
          title="Sign out"
        >
          Sign out
        </button>
      </div>
      <div className={styles.timers}>
        <SlotView slot={1} session={data?.slots["1"] ?? null} now={now} />
        <SlotView slot={2} session={data?.slots["2"] ?? null} now={now} />
        <div className={styles.today}>
          <span className={styles.label}>Today total</span>
          <span className={styles.value}>{formatDuration(todayTotal)}</span>
        </div>
        <div className={styles.today}>
          <span className={styles.label}>All-time usage</span>
          <span className={styles.value}>{formatDuration(allTimeTotal)}</span>
        </div>
      </div>
    </div>
  );
}
