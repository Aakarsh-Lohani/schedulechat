"use client";

import { useEffect, useState } from "react";
import { Bell, Clock, Play, X } from "lucide-react";
import { formatTimeOfDay } from "@/lib/calendar/recurrence";
import styles from "./AlarmDialog.module.scss";

export interface AlarmItem {
  id: string; // scheduled task id
  title: string;
  description?: string;
  startTime: string;
  durationMinutes: number;
  type: "reminder" | "alarm"; // reminder = 10m before, alarm = starting now
  taskId?: string; // ID of materialized task if available
  notificationId?: string;
}

interface AlarmDialogProps {
  item: AlarmItem;
  slot1Busy?: boolean;
  slot2Busy?: boolean;
  onStartInSlot: (slot: 1 | 2, item: AlarmItem) => Promise<void> | void;
  onStartAtScheduledTime: (slot: 1 | 2, item: AlarmItem) => Promise<void> | void;
  onSnooze: (item: AlarmItem) => void;
  onCancelToday: (item: AlarmItem) => Promise<void> | void;
  onDismiss: (item: AlarmItem) => void;
}

/**
 * Plays a pleasant synthetic chime using the browser Web Audio API.
 * Guaranteed to work without external assets or network fetches.
 */
function playAudioChime(type: "reminder" | "alarm") {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    if (type === "alarm") {
      // Two-tone rising chime: 440Hz -> 880Hz
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
      osc1.frequency.exponentialRampToValueAtTime(659.25, ctx.currentTime + 0.18); // E5
      gain1.gain.setValueAtTime(0.2, ctx.currentTime);
      gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start();
      osc1.stop(ctx.currentTime + 0.6);

      // Repeat second ping
      setTimeout(() => {
        try {
          const osc2 = ctx.createOscillator();
          const gain2 = ctx.createGain();
          osc2.type = "sine";
          osc2.frequency.setValueAtTime(659.25, ctx.currentTime);
          osc2.frequency.exponentialRampToValueAtTime(783.99, ctx.currentTime + 0.2); // G5
          gain2.gain.setValueAtTime(0.25, ctx.currentTime);
          gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
          osc2.connect(gain2);
          gain2.connect(ctx.destination);
          osc2.start();
          osc2.stop(ctx.currentTime + 0.8);
        } catch {
          // ignore
        }
      }, 220);
    } else {
      // Subtle single reminder bell
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.5);
    }
  } catch {
    // AudioContext blocked or not allowed prior to interaction
  }
}

export function AlarmDialog({
  item,
  slot1Busy = false,
  slot2Busy = false,
  onStartInSlot,
  onStartAtScheduledTime,
  onSnooze,
  onCancelToday,
  onDismiss,
}: AlarmDialogProps) {
  const [isPending, setIsPending] = useState(false);

  useEffect(() => {
    playAudioChime(item.type);
  }, [item.id, item.type]);

  const isAlarm = item.type === "alarm";
  const defaultSlot: 1 | 2 = !slot1Busy ? 1 : 2;

  const handleAction = async (fn: () => Promise<void> | void) => {
    if (isPending) return;
    setIsPending(true);
    try {
      await fn();
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={() => !isPending && onDismiss(item)}>
      <div
        className={`${styles.dialog} ${isAlarm ? styles.alarm : styles.reminder}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.header}>
          <span className={`${styles.tag} ${isAlarm ? styles.alarm : styles.reminder}`}>
            <Bell size={12} />
            {isAlarm ? "Starting Now" : "Upcoming Reminder"}
          </span>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={() => onDismiss(item)}
            disabled={isPending}
            title="Dismiss alert"
          >
            <X size={15} />
          </button>
        </div>

        <h3 className={styles.title}>{item.title}</h3>
        {item.description && <p className={styles.desc}>{item.description}</p>}

        <div className={styles.metaRow}>
          <div className={styles.metaItem}>
            <Clock size={13} />
            <span>Time: {formatTimeOfDay(item.startTime)}</span>
          </div>
          <div className={styles.metaItem}>
            <span>Duration: {item.durationMinutes} mins</span>
          </div>
        </div>

        <div className={styles.actions}>
          {/* Action 1: Start Now in Slot 1 or Slot 2 */}
          <div className={styles.slotButtons}>
            <button
              type="button"
              className={styles.slotBtn}
              onClick={() => handleAction(() => onStartInSlot(1, item))}
              disabled={isPending || slot1Busy}
              title={slot1Busy ? "Slot 1 is in use" : "Start now in Slot 1"}
            >
              <Play size={12} fill="currentColor" />
              {slot1Busy ? "Slot 1 (In Use)" : "Start Now (Slot 1)"}
            </button>
            <button
              type="button"
              className={styles.slotBtn}
              onClick={() => handleAction(() => onStartInSlot(2, item))}
              disabled={isPending || slot2Busy}
              title={slot2Busy ? "Slot 2 is in use" : "Start now in Slot 2"}
            >
              <Play size={12} fill="currentColor" />
              {slot2Busy ? "Slot 2 (In Use)" : "Start Now (Slot 2)"}
            </button>
          </div>

          {/* Action 2: Start at Scheduled Time */}
          <button
            type="button"
            className={styles.scheduledBtn}
            onClick={() => handleAction(() => onStartAtScheduledTime(defaultSlot, item))}
            disabled={isPending}
            title={`Auto-start at ${item.startTime}`}
          >
            <Clock size={12} />
            Start at Scheduled Time ({item.startTime})
          </button>

          {/* Action 3 & 4: Snooze 5 mins / Cancel Event for Today */}
          <div className={styles.subActions}>
            <button
              type="button"
              className={styles.snoozeBtn}
              onClick={() => handleAction(() => onSnooze(item))}
              disabled={isPending}
              title="Remind again in 5 minutes"
            >
              Snooze 5m
            </button>
            <button
              type="button"
              className={styles.cancelBtn}
              onClick={() => handleAction(() => onCancelToday(item))}
              disabled={isPending}
              title="Cancel this routine for today"
            >
              Cancel Event for Today
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
