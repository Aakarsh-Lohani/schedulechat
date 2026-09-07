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

function SlotView({ slot, session }: { slot: 1 | 2; session: TimerSlotDTO | null }) {
  const now = useNowTick();
  const confirmStart = useConfirmStartTimer();
  const cancelTimer = useCancelTimer();
  const extendTimer = useExtendTimer();
  const stopTimer = useStopTimer();
  const { setNodeRef, isOver: isDropTarget } = useDroppable({ id: `timer:${slot}`, disabled: !!session });

  // Guard ref to ensure confirm-start fires exactly once per session
  const confirmedRef = useRef<string | null>(null);

  if (!session) {
    return (
      <div ref={setNodeRef} className={`${styles.slot} ${isDropTarget ? styles.dropTarget : ""}`}>
        <div className={styles.idle}>Timer {slot} · drag a task here</div>
      </div>
    );
  }

  const startedAtMs = new Date(session.startedAt).getTime();

  if (session.status === "countdown") {
    const endsAtMs = session.countdownEndsAt ? new Date(session.countdownEndsAt).getTime() : startedAtMs + COUNTDOWN_SECONDS * 1000;
    const remaining = Math.max(0, Math.round((endsAtMs - now) / 1000));

    // Fire confirm-start exactly once when countdown reaches zero
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useEffect(() => {
      if (remaining === 0 && confirmedRef.current !== session.id) {
        confirmedRef.current = session.id;
        confirmStart.mutate(session.id);
      }
    }, [remaining, session.id, confirmStart]);

    return (
      <div className={styles.slot}>
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
  const remaining = plannedTotal - workElapsedSeconds;
  const isOver = remaining <= 0;

  return (
    <div className={`${styles.slot} ${isOver ? styles.over : ""}`}>
      <div className={styles.ring} />
      <div className={styles.meta}>
        <span className={styles.label}>Timer {slot}</span>
        <span className={styles.taskName}>{session.taskTitle}</span>
        <span className={styles.value}>
          {isOver ? `+${formatClock(-remaining)} over` : `${formatClock(remaining)} remaining`}
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

  let liveSeconds = 0;
  if (data) {
    for (const key of ["1", "2"] as const) {
      const s = data.slots[key];
      if (s && s.status === "running") {
        const startedAtMs = new Date(s.startedAt).getTime();
        liveSeconds += Math.max(0, (now - startedAtMs) / 1000 - COUNTDOWN_SECONDS);
      }
    }
  }
  const todayTotal = (data?.completedSecondsTodayBase ?? 0) + liveSeconds;

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
        <SlotView slot={1} session={data?.slots["1"] ?? null} />
        <SlotView slot={2} session={data?.slots["2"] ?? null} />
        <div className={styles.today}>
          <span className={styles.label}>Today total</span>
          <span className={styles.value}>{formatDuration(todayTotal)}</span>
        </div>
      </div>
    </div>
  );
}
