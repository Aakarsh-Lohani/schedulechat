"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { RealtimeEventType } from "@/lib/realtime/emitter";

const EVENT_TO_QUERY_KEYS: Record<RealtimeEventType, string[][]> = {
  "task-updated": [["tasks"], ["calendar-tasks"]],
  "tabs-updated": [["tabs"]],
  "timer-changed": [["timers", "active"], ["tasks"], ["calendar-tasks"]],
  "ai-action-executed": [["tasks"], ["calendar-tasks"], ["timers", "active"], ["ai-actions"], ["tabs"]],
  "ai-action-undone": [["tasks"], ["calendar-tasks"], ["timers", "active"], ["ai-actions"], ["tabs"]],
};

const ALL_SYNC_QUERY_KEYS: string[][] = [
  ["tasks"],
  ["calendar-tasks"],
  ["tabs"],
  ["timers", "active"],
  ["ai-actions"],
];

const MAX_CONSECUTIVE_FAILURES = 5;
const BASE_RECONNECT_MS = 1000;
const MAX_RECONNECT_MS = 30000;
const POLL_INTERVAL_MS = 15000;

function calculateBackoff(attempt: number): number {
  const exponential = Math.min(MAX_RECONNECT_MS, BASE_RECONNECT_MS * Math.pow(1.5, attempt));
  const jitter = Math.random() * 1000;
  return exponential + jitter;
}

export function useRealtimeSync() {
  const queryClient = useQueryClient();
  const queryClientRef = useRef(queryClient);

  useEffect(() => {
    queryClientRef.current = queryClient;
  }, [queryClient]);

  useEffect(() => {
    let source: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let consecutiveFailures = 0;
    let stopped = false;
    let hasConnectedOnce = false;

    const invalidateAll = () => {
      ALL_SYNC_QUERY_KEYS.forEach((key) => {
        queryClientRef.current.invalidateQueries({ queryKey: key });
      });
    };

    const startPolling = () => {
      if (pollTimer) return;
      pollTimer = setInterval(invalidateAll, POLL_INTERVAL_MS);
    };

    const stopPolling = () => {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    };

    const connect = () => {
      if (stopped) return;

      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }

      if (source) {
        source.close();
        source = null;
      }

      try {
        source = new EventSource("/api/events");

        source.onopen = () => {
          if (hasConnectedOnce || consecutiveFailures > 0) {
            invalidateAll();
          }
          hasConnectedOnce = true;
          consecutiveFailures = 0;
          stopPolling();
        };

        source.onmessage = (evt) => {
          try {
            const parsed = JSON.parse(evt.data) as { type: RealtimeEventType };
            const keys = EVENT_TO_QUERY_KEYS[parsed.type] ?? [];
            keys.forEach((key) => queryClientRef.current.invalidateQueries({ queryKey: key }));
          } catch {
            // ignore malformed events (e.g. keep-alive comments)
          }
        };

        source.onerror = () => {
          if (source) {
            source.close();
            source = null;
          }
          consecutiveFailures += 1;

          if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
            startPolling();
          }

          const delay = calculateBackoff(consecutiveFailures);
          reconnectTimer = setTimeout(connect, delay);
        };
      } catch {
        consecutiveFailures += 1;
        const delay = calculateBackoff(consecutiveFailures);
        reconnectTimer = setTimeout(connect, delay);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        if (!source || source.readyState === EventSource.CLOSED) {
          connect();
        }
      }
    };

    const handleOnline = () => {
      connect();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("online", handleOnline);

    connect();

    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("online", handleOnline);
      if (source) source.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      stopPolling();
    };
  }, []);
}