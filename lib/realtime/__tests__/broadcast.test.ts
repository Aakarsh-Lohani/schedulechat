import { describe, it, expect, vi, beforeEach } from "vitest";
import { broadcastSyncEvent, subscribeBroadcastSync } from "../broadcast";

describe("BroadcastChannel Realtime Sync", () => {
  let listeners: Array<(event: MessageEvent) => void> = [];
  let postMessageMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    listeners = [];
    postMessageMock = vi.fn((data: unknown) => {
      // Simulate dispatching to other subscribers
      listeners.forEach((listener) => {
        listener({ data } as MessageEvent);
      });
    });

    class MockBroadcastChannel {
      name: string;
      constructor(name: string) {
        this.name = name;
      }
      postMessage = postMessageMock;
      addEventListener = vi.fn((event: string, callback: (e: MessageEvent) => void) => {
        if (event === "message") {
          listeners.push(callback);
        }
      });
      removeEventListener = vi.fn((event: string, callback: (e: MessageEvent) => void) => {
        if (event === "message") {
          listeners = listeners.filter((l) => l !== callback);
        }
      });
      close = vi.fn();
    }

    vi.stubGlobal("BroadcastChannel", MockBroadcastChannel);
  });

  it("registers a subscriber and receives events from other sources", () => {
    const received: string[] = [];
    const unsubscribe = subscribeBroadcastSync((type) => {
      received.push(type);
    });

    // Simulate an incoming message from a different tab instance
    listeners.forEach((l) =>
      l({
        data: {
          type: "task-updated",
          sourceId: "tab-other-123",
          timestamp: Date.now(),
        },
      } as MessageEvent)
    );

    expect(received).toEqual(["task-updated"]);

    unsubscribe();
  });

  it("filters out events from the same tab instance to avoid redundant cycles", () => {
    const received: string[] = [];
    const unsubscribe = subscribeBroadcastSync((type) => {
      received.push(type);
    });

    // broadcastSyncEvent sends TAB_INSTANCE_ID
    broadcastSyncEvent("timer-changed");

    // Because mock dispatches back to self, handler should ignore it since sourceId === TAB_INSTANCE_ID
    expect(received).toEqual([]);

    unsubscribe();
  });
});
