"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { RealtimeEventType } from "@/lib/realtime/emitter";
import { subscribeBroadcastSync } from "@/lib/realtime/broadcast";

const EVENT_TO_QUERY_KEYS: Record<RealtimeEventType, string[][]> = {
  "task-updated": [["tasks"], ["calendar-tasks"]],
  "tabs-updated": [["tabs"]],
  "timer-changed": [["timers", "active"], ["tasks"], ["calendar-tasks"], ["notifications"]],
  "ai-action-executed": [["tasks"], ["calendar-tasks"], ["timers", "active"], ["ai-actions"], ["tabs"]],
  "ai-action-undone": [["tasks"], ["calendar-tasks"], ["timers", "active"], ["ai-actions"], ["tabs"]],
  "notifications-updated": [["notifications"], ["timers", "active"], ["analytics"]],
};

const ALL_SYNC_QUERY_KEYS: string[][] = [
  ["tasks"],
  ["calendar-tasks"],
  ["tabs"],
  ["timers", "active"],
  ["ai-actions"],
  ["notifications"],
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

  // 1. Instant cross-tab sync via local browser BroadcastChannel (0 server compute)
  useEffect(() => {
    const unsubscribeBroadcast = subscribeBroadcastSync((type) => {
      const keys = EVENT_TO_QUERY_KEYS[type] ?? [];
      keys.forEach((key) => queryClientRef.current.invalidateQueries({ queryKey: key }));
    });
    return unsubscribeBroadcast;
  }, []);

  // 2. Serverless-aware EventSource lifecycle
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
      // Never poll in background tab
      if (document.visibilityState === "hidden") return;
      if (pollTimer) return;
      pollTimer = setInterval(invalidateAll, POLL_INTERVAL_MS);
    };

    const stopPolling = () => {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    };

    const disconnect = () => {
      if (source) {
        source.close();
        source = null;
      }
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      stopPolling();
    };

    const connect = () => {
      if (stopped) return;
      // Do not open serverless SSE connection when the tab is hidden
      if (document.visibilityState === "hidden") return;

      disconnect();

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
          disconnect();
          consecutiveFailures += 1;

          if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
            startPolling();
          }

          if (document.visibilityState === "visible") {
            const delay = calculateBackoff(consecutiveFailures);
            reconnectTimer = setTimeout(connect, delay);
          }
        };
      } catch {
        consecutiveFailures += 1;
        if (document.visibilityState === "visible") {
          const delay = calculateBackoff(consecutiveFailures);
          reconnectTimer = setTimeout(connect, delay);
        }
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        // Tab is hidden or minimized: disconnect immediately to conserve Vercel memory hours & CPU
        disconnect();
      } else if (document.visibilityState === "visible") {
        // Tab is active again: immediately re-sync data and reconnect
        invalidateAll();
        connect();
      }
    };

    const handleOnline = () => {
      if (document.visibilityState === "visible") {
        invalidateAll();
        connect();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("online", handleOnline);

    // Initial connection only if page is visible
    if (document.visibilityState === "visible") {
      connect();
    }

    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("online", handleOnline);
      disconnect();
    };
  }, []);
}