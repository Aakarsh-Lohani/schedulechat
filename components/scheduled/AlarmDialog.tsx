"use client";

import { useEffect } from "react";
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
}

interface AlarmDialogProps {
  item: AlarmItem;
  onStartInSlot: (slot: 1 | 2, item: AlarmItem) => void;
  onSnooze: (item: AlarmItem) => void;
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

export function AlarmDialog({ item, onStartInSlot, onSnooze, onDismiss }: AlarmDialogProps) {
  useEffect(() => {
    playAudioChime(item.type);
  }, [item.id, item.type]);

  const isAlarm = item.type === "alarm";

  return (
    <div className={styles.overlay} onClick={() => onDismiss(item)}>
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
          <div className={styles.slotButtons}>
            <button
              type="button"
              className={styles.slotBtn}
              onClick={() => onStartInSlot(1, item)}
            >
              <Play size={12} fill="currentColor" />
              Start in Slot 1
            </button>
            <button
              type="button"
              className={styles.slotBtn}
              onClick={() => onStartInSlot(2, item)}
            >
              <Play size={12} fill="currentColor" />
              Start in Slot 2
            </button>
          </div>

          <div className={styles.subActions}>
            <button
              type="button"
              className={styles.snoozeBtn}
              onClick={() => onSnooze(item)}
            >
              Snooze 5 mins
            </button>
            <button
              type="button"
              className={styles.dismissBtn}
              onClick={() => onDismiss(item)}
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
