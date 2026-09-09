"use client";

import { useEffect, useRef, useState } from "react";
import {
  useScheduledTasks,
  useStartTimer,
  useTasks,
  useCreateTask,
  useTabs,
  useActiveTimers,
} from "@/lib/api/hooks";
import { doesRRuleOccurOnDate } from "@/lib/calendar/recurrence";
import type { AlarmItem } from "@/components/scheduled/AlarmDialog";

export function useScheduledTaskAlarms() {
  const { data: scheduledTasks } = useScheduledTasks();
  const { data: todayTasks } = useTasks({}, "today");
  const { data: tabs } = useTabs();
  const { data: activeTimers } = useActiveTimers();
  const startTimer = useStartTimer();
  const createTask = useCreateTask();

  const [activeAlarm, setActiveAlarm] = useState<AlarmItem | null>(null);

  // Keep track of alerted events today to prevent duplicate popups
  const alertedRef = useRef<Set<string>>(new Set());
  const snoozedRef = useRef<Map<string, number>>(new Map());

  // Request browser notification permission once
  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  // Materialize today's scheduled tasks on mount and date changes
  useEffect(() => {
    fetch("/api/scheduled-tasks/materialize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tzOffsetMinutes: new Date().getTimezoneOffset() }),
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!scheduledTasks || scheduledTasks.length === 0) return;

    function checkAlarms() {
      const now = new Date();
      const todayDateStr = now.toDateString();
      const nowMins = now.getHours() * 60 + now.getMinutes();
      const nowMs = now.getTime();

      for (const task of scheduledTasks ?? []) {
        if (!task.enabled) continue;

        // Check if task recurs today
        const occursToday = doesRRuleOccurOnDate(
          task.recurrenceRule,
          now,
          task.createdAt ? new Date(task.createdAt) : undefined
        );
        if (!occursToday) continue;

        // Check snooze
        const snoozedUntil = snoozedRef.current.get(task.id);
        if (snoozedUntil && snoozedUntil > nowMs) continue;

        const [startH, startM] = task.startTime.split(":").map(Number);
        if (startH === undefined || startM === undefined) continue;
        const taskStartMins = startH * 60 + startM;

        // 1. Alarm / Auto-Start Condition: Starting Now (within current minute window)
        const alarmKey = `${task.id}-alarm-${todayDateStr}-${task.startTime}`;
        if (nowMins === taskStartMins && !alertedRef.current.has(alarmKey)) {
          alertedRef.current.add(alarmKey);

          // Find if there's already a materialized task in Today's tasks
          const matchingTodayTask = todayTasks?.find(
            (t) => t.title.toLowerCase() === task.title.toLowerCase()
          );

          // Check if either slot is idle
          const slot1Free = !activeTimers?.slots["1"];
          const slot2Free = !activeTimers?.slots["2"];
          const availableSlot: 1 | 2 | null = slot1Free ? 1 : slot2Free ? 2 : null;

          // If a slot is free and we have a task ID, automatically start the timer!
          if (availableSlot && matchingTodayTask) {
            startTimer.mutate({ taskId: matchingTodayTask.id, slot: availableSlot });

            if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
              try {
                new Notification(`Scheduled Task Started: ${task.title}`, {
                  body: `Began automatically in Timer Slot ${availableSlot} (${task.durationMinutes} mins planned)`,
                  icon: "/favicon.ico",
                });
              } catch {
                // ignore
              }
            }
            return;
          }

          // If both slots are occupied or task is not yet found, show interactive dialog
          setActiveAlarm({
            id: task.id,
            title: task.title,
            description: task.description,
            startTime: task.startTime,
            durationMinutes: task.durationMinutes,
            type: "alarm",
            taskId: matchingTodayTask?.id,
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

        // 2. Reminder Condition: Reminder minutes before start
        const reminderMins = task.reminderMinutes ?? 10;
        if (reminderMins > 0) {
          const reminderTargetMins = taskStartMins - reminderMins;
          const reminderKey = `${task.id}-reminder-${todayDateStr}-${reminderTargetMins}`;

          if (nowMins === reminderTargetMins && !alertedRef.current.has(reminderKey)) {
            alertedRef.current.add(reminderKey);

            setActiveAlarm({
              id: task.id,
              title: task.title,
              description: task.description,
              startTime: task.startTime,
              durationMinutes: task.durationMinutes,
              type: "reminder",
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

    // Check immediately and every 10 seconds
    checkAlarms();
    const interval = setInterval(checkAlarms, 10000);
    return () => clearInterval(interval);
  }, [scheduledTasks, todayTasks, activeTimers?.slots, startTimer]);

  async function handleStartInSlot(slot: 1 | 2, item: AlarmItem) {
    let taskId = item.taskId;

    // If no existing task, create a quick task in today's tasks
    const defaultTabId = tabs?.[0]?.id;
    if (!taskId && defaultTabId) {
      try {
        const res = await createTask.mutateAsync({
          tabId: defaultTabId,
          title: item.title,
          estimateMinutes: item.durationMinutes,
          scheduledDate: new Date().toISOString(),
          status: "in-progress",
        });
        taskId = res.task.id;
      } catch {
        // failed to create
      }
    }

    if (taskId) {
      startTimer.mutate({ taskId, slot });
    }

    setActiveAlarm(null);
  }

  function handleSnooze(item: AlarmItem) {
    // Snooze for 5 minutes
    snoozedRef.current.set(item.id, Date.now() + 5 * 60 * 1000);
    setActiveAlarm(null);
  }

  function handleDismiss() {
    setActiveAlarm(null);
  }

  return {
    activeAlarm,
    handleStartInSlot,
    handleSnooze,
    handleDismiss,
  };
}
