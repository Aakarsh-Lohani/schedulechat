"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { RealtimeEventType } from "@/lib/realtime/emitter";

const EVENT_TO_QUERY_KEYS: Record<RealtimeEventType, string[][]> = {
  "task-updated": [["tasks"], ["calendar-tasks"]],
  "timer-changed": [["timers", "active"], ["tasks"]],
  "ai-action-executed": [["tasks"], ["calendar-tasks"], ["timers", "active"], ["ai-actions"]],
  "ai-action-undone": [["tasks"], ["calendar-tasks"], ["timers", "active"], ["ai-actions"]],
};

/**
 * Subscribes once per app session to /api/events and invalidates the relevant
 * TanStack Query caches whenever the server reports a change. Falls back to
 * periodic polling if the SSE connection can't be established (some proxies
 * mishandle long-lived streams).
 */
export function useRealtimeSync() {
  const queryClient = useQueryClient();
  const fellBackRef = useRef(false);

  useEffect(() => {
    let pollId: ReturnType<typeof setInterval> | null = null;
    const source = new EventSource("/api/events");

    const invalidateAll = () => {
      Object.values(EVENT_TO_QUERY_KEYS)
        .flat()
        .forEach((key) => queryClient.invalidateQueries({ queryKey: key }));
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
      if (fellBackRef.current) return;
      fellBackRef.current = true;
      source.close();
      // Fallback: poll every 15s instead of a long-lived stream.
      pollId = setInterval(invalidateAll, 15000);
    };

    return () => {
      source.close();
      if (pollId) clearInterval(pollId);
    };
  }, [queryClient]);
}
