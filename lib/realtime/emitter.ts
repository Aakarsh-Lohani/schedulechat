/**
 * In-memory per-user pub/sub for SSE. Fine for a single-instance deployment.
 * If this ever needs to scale across multiple server instances, swap this for a
 * Mongo change-stream or Redis pub/sub behind the same emit()/subscribe() interface.
 */

export type RealtimeEventType = "task-updated" | "timer-changed" | "ai-action-executed" | "ai-action-undone";

export interface RealtimeEvent {
  type: RealtimeEventType;
  payload?: unknown;
}

type Listener = (event: RealtimeEvent) => void;

declare global {
  var __scheduleChatListeners: Map<string, Set<Listener>> | undefined;
}

const listeners: Map<string, Set<Listener>> = global.__scheduleChatListeners ?? new Map();
global.__scheduleChatListeners = listeners;

export function subscribe(userId: string, listener: Listener): () => void {
  if (!listeners.has(userId)) listeners.set(userId, new Set());
  listeners.get(userId)!.add(listener);
  return () => {
    listeners.get(userId)?.delete(listener);
  };
}

export function emit(userId: string, event: RealtimeEvent): void {
  listeners.get(userId)?.forEach((listener) => listener(event));
}

