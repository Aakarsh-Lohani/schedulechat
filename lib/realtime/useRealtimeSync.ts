"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { RealtimeEventType } from "@/lib/realtime/emitter";

const EVENT_TO_QUERY_KEYS: Record<RealtimeEventType, string[][]> = {
  "task-updated": [["tasks"], ["calendar-tasks"]],
  "tabs-updated": [["tabs"]],
  "timer-changed": [["timers", "active"], ["tasks"]],
  "ai-action-executed": [["tasks"], ["calendar-tasks"], ["timers", "active"], ["ai-actions"]],
  "ai-action-undone": [["tasks"], ["calendar-tasks"], ["timers", "active"], ["ai-actions"]],
};

// A dropped SSE connection is EXPECTED on serverless hosts (e.g. Vercel kills a
// function after its max execution duration, unrelated to anything going wrong)
// — so a single disconnect must not be treated as fatal. Only fall back to
// polling after several reconnect attempts fail in a row.
const MAX_CONSECUTIVE_FAILURES = 4;
const RECONNECT_DELAY_MS = 2000;
const POLL_INTERVAL_MS = 15000;

/**
 * Subscribes to /api/events and invalidates the relevant TanStack Query caches
 * whenever the server reports a change. Reconnects automatically on a dropped
 * connection (normal on serverless hosts), and only falls back to periodic
 * polling if reconnects keep failing.
 */
export function useRealtimeSync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    let source: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let consecutiveFailures = 0;
    let stopped = false;

    const invalidateAll = () => {
      Object.values(EVENT_TO_QUERY_KEYS)
        .flat()
        .forEach((key) => queryClient.invalidateQueries({ queryKey: key }));
    };

    const startPolling = () => {
      if (pollTimer) return;
      pollTimer = setInterval(invalidateAll, POLL_INTERVAL_MS);
    };

    const connect = () => {
      if (stopped) return;
      source = new EventSource("/api/events");

      source.onopen = () => {
        consecutiveFailures = 0;
        // If we'd fallen back to polling during earlier failed attempts, a
        // successful reconnect means SSE is healthy again — stop polling.
        if (pollTimer) {
          clearInterval(pollTimer);
          pollTimer = null;
        }
      };

      source.onmessage = (evt) => {
        try {
          const parsed = JSON.parse(evt.data) as { type: RealtimeEventType };
          const keys = EVENT_TO_QUERY_KEYS[parsed.type] ?? [];
          keys.forEach((key) => queryClient.invalidateQueries({ queryKey: key }));
        } catch {
          // ignore malformed events (e.g. keep-alive comments)
        }
      };

      source.onerror = () => {
        source?.close();
        consecutiveFailures += 1;

        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          startPolling();
          // Keep trying to reconnect in the background even while polling, so
          // we can drop back to realtime SSE the moment it's healthy again.
          reconnectTimer = setTimeout(connect, POLL_INTERVAL_MS);
          return;
        }

        reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
      };
    };

    connect();

    return () => {
      stopped = true;
      source?.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [queryClient]);
}