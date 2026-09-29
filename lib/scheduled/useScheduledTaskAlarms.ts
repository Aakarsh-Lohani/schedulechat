"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useScheduledTasks,
  useStartTimer,
  useActiveTimers,
  useNotifications,
  useNotificationAction,
} from "@/lib/api/hooks";
import { doesRRuleOccurOnDate } from "@/lib/calendar/recurrence";
import type { AlarmItem } from "@/components/scheduled/AlarmDialog";

export function useScheduledTaskAlarms() {
  const { data: scheduledTasks } = useScheduledTasks();
  const { data: activeTimers } = useActiveTimers();
  const { data: notificationsData } = useNotifications();
  const notificationAction = useNotificationAction();
  const startTimer = useStartTimer();
  const qc = useQueryClient();

  const [activeAlarm, setActiveAlarm] = useState<AlarmItem | null>(null);

  // Keep track of alerted events today to prevent duplicate popups
  const alertedRef = useRef<Set<string>>(new Set());
  const snoozedRef = useRef<Map<string, number>>(new Map());
  const startedTodayRef = useRef<Set<string>>(new Set());
  const cancelledTodayRef = useRef<Set<string>>(new Set());
  const scheduledStartPreferencesRef = useRef<Map<string, 1 | 2>>(new Map());

  // Request browser notification permission once
  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  const slot1Busy = !!activeTimers?.slots["1"];
  const slot2Busy = !!activeTimers?.slots["2"];

  useEffect(() => {
    if (!scheduledTasks || scheduledTasks.length === 0) return;

    function checkAlarms() {
      const now = new Date();
      const todayDateStr = now.toDateString();
      const todayIsoStr = now.toISOString().slice(0, 10);
      const nowMs = now.getTime();
      const nowSecs = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();

      const notifications = notificationsData?.notifications ?? [];

      for (const task of scheduledTasks ?? []) {
        if (!task.enabled) continue;

        // Check if task recurs today
        const occursToday = doesRRuleOccurOnDate(
          task.recurrenceRule,
          now,
          task.createdAt ? new Date(task.createdAt) : undefined
        );
        if (!occursToday) continue;

        // Check cancellation for today
        if (cancelledTodayRef.current.has(task.id)) continue;
        const matchingNotif = notifications.find(
          (n) => n.scheduledTaskId === task.id && (n.date === todayIsoStr || n.date === todayDateStr)
        );
        if (matchingNotif && matchingNotif.status === "cancelled") {
          cancelledTodayRef.current.add(task.id);
          continue;
        }

        // Check if task is already running in active timers
        const slot1Session = activeTimers?.slots["1"];
        const slot2Session = activeTimers?.slots["2"];
        const isRunningInSlot1 =
          (slot1Session?.scheduledTaskId === task.id || slot1Session?.taskId === task.id) &&
          slot1Session?.status &&
          ["countdown", "running", "paused"].includes(slot1Session.status);
        const isRunningInSlot2 =
          (slot2Session?.scheduledTaskId === task.id || slot2Session?.taskId === task.id) &&
          slot2Session?.status &&
          ["countdown", "running", "paused"].includes(slot2Session.status);

        if (isRunningInSlot1 || isRunningInSlot2) {
          // Already running!
          continue;
        }

        // Check snooze
        const snoozedUntil = snoozedRef.current.get(task.id);
        if (snoozedUntil && snoozedUntil > nowMs) continue;

        const [startH, startM] = task.startTime.split(":").map(Number);
        if (startH === undefined || startM === undefined) continue;
        const taskStartSecs = (startH * 60 + startM) * 60;

        // Difference in seconds: positive if task is in the future, negative if in the past
        let diffSecs = taskStartSecs - nowSecs;
        if (diffSecs < -43200) diffSecs += 86400;
        else if (diffSecs > 43200) diffSecs -= 86400;

        // 1. Alarm / Auto-Start Condition: 15s before start up to 30s after start
        if (diffSecs <= 15 && diffSecs >= -30) {
          const autoStartKey = `${task.id}-autostart-${todayDateStr}`;
          if (!startedTodayRef.current.has(autoStartKey)) {
            // Determine available slot (respecting user preference if specified)
            const prefSlot = scheduledStartPreferencesRef.current.get(task.id);
            const slot1Free = !activeTimers?.slots["1"];
            const slot2Free = !activeTimers?.slots["2"];

            let chosenSlot: 1 | 2 | null = null;
            if (prefSlot && (prefSlot === 1 ? slot1Free : slot2Free)) {
              chosenSlot = prefSlot;
            } else if (slot1Free) {
              chosenSlot = 1;
            } else if (slot2Free) {
              chosenSlot = 2;
            }

            if (chosenSlot) {
              startedTodayRef.current.add(autoStartKey);
              startTimer.mutate({ scheduledTaskId: task.id, slot: chosenSlot });
              setActiveAlarm(null);

              if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
                try {
                  new Notification(`Scheduled Task Started: ${task.title}`, {
                    body: `Began automatically in Timer Slot ${chosenSlot} (${task.durationMinutes} mins planned)`,
                    icon: "/favicon.ico",
                  });
                } catch {
                  // ignore
                }
              }
              return;
            }

            // If both slots occupied, show interactive alarm dialog
            const alarmKey = `${task.id}-alarm-${todayDateStr}`;
            if (!alertedRef.current.has(alarmKey)) {
              alertedRef.current.add(alarmKey);
              setActiveAlarm({
                id: task.id,
                title: task.title,
                description: task.description,
                startTime: task.startTime,
                durationMinutes: task.durationMinutes,
                type: "alarm",
                notificationId: matchingNotif?.id,
              });

              if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
                try {
                  new Notification(`Scheduled Task Starting Now: ${task.title}`, {
                    body: `${task.title} is scheduled to start at ${task.startTime} (${task.durationMinutes} mins)`,
                    icon: "/favicon.ico",
                  });
                } catch {
                  // ignore
                }
              }
              return;
            }
          }
        }

        // 2. Reminder Condition: Reminder minutes before start
        const reminderMins = task.reminderMinutes ?? 10;
        const reminderSecs = reminderMins * 60;
        if (reminderMins > 0) {
          const reminderKey = `${task.id}-reminder-${todayDateStr}`;

          if (diffSecs > 15 && diffSecs <= reminderSecs && !alertedRef.current.has(reminderKey)) {
            alertedRef.current.add(reminderKey);

            setActiveAlarm({
              id: task.id,
              title: task.title,
              description: task.description,
              startTime: task.startTime,
              durationMinutes: task.durationMinutes,
              type: "reminder",
              notificationId: matchingNotif?.id,
            });

            if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
              try {
                new Notification(`Upcoming Reminder: ${task.title}`, {
                  body: `${task.title} starts in ${reminderMins} minutes (at ${task.startTime})`,
                  icon: "/favicon.ico",
                });
              } catch {
                // ignore
              }
            }
            return;
          }
        }
      }
    }

    // Check immediately and every 5 seconds
    checkAlarms();
    const interval = setInterval(checkAlarms, 5000);
    return () => clearInterval(interval);
  }, [scheduledTasks, activeTimers?.slots, notificationsData?.notifications, startTimer]);

  async function handleStartInSlot(slot: 1 | 2, item: AlarmItem) {
    const todayDateStr = new Date().toDateString();
    startedTodayRef.current.add(`${item.id}-autostart-${todayDateStr}`);
    await startTimer.mutateAsync({ scheduledTaskId: item.id, slot });
    setActiveAlarm(null);
  }

  function handleStartAtScheduledTime(slot: 1 | 2, item: AlarmItem) {
    scheduledStartPreferencesRef.current.set(item.id, slot);
    setActiveAlarm(null);
  }

  function handleSnooze(item: AlarmItem) {
    // Snooze for 5 minutes
    snoozedRef.current.set(item.id, Date.now() + 5 * 60 * 1000);
    setActiveAlarm(null);
  }

  async function handleCancelToday(item: AlarmItem) {
    cancelledTodayRef.current.add(item.id);
    if (item.notificationId) {
      await notificationAction.mutateAsync({ id: item.notificationId, action: "cancel" });
    } else {
      await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduledTaskId: item.id, action: "cancel" }),
      }).catch(() => {});
      qc.invalidateQueries({ queryKey: ["notifications"] });
      qc.invalidateQueries({ queryKey: ["timers", "active"] });
    }
    setActiveAlarm(null);
  }

  function handleDismiss() {
    setActiveAlarm(null);
  }

  return {
    activeAlarm,
    slot1Busy,
    slot2Busy,
    handleStartInSlot,
    handleStartAtScheduledTime,
    handleSnooze,
    handleCancelToday,
    handleDismiss,
  };
}
