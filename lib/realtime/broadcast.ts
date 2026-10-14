import type { RealtimeEventType } from "./emitter";

export interface BroadcastSyncMessage {
  type: RealtimeEventType;
  sourceId: string;
  timestamp: number;
}

const CHANNEL_NAME = "schedulechat-sync-channel";

// Unique ID for this tab instance to prevent echo/duplicate invalidations
const TAB_INSTANCE_ID =
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : Math.random().toString(36).substring(2);

let channelInstance: BroadcastChannel | null = null;

function getChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") {
    return null;
  }
  if (!channelInstance) {
    try {
      channelInstance = new BroadcastChannel(CHANNEL_NAME);
    } catch {
      return null;
    }
  }
  return channelInstance;
}

export function broadcastSyncEvent(type: RealtimeEventType): void {
  try {
    const channel = getChannel();
    if (channel) {
      const message: BroadcastSyncMessage = {
        type,
        sourceId: TAB_INSTANCE_ID,
        timestamp: Date.now(),
      };
      channel.postMessage(message);
    }
  } catch {
    // Graceful fallback for private/restricted browser contexts
  }
}

export function subscribeBroadcastSync(callback: (type: RealtimeEventType) => void): () => void {
  const channel = getChannel();
  if (!channel) return () => {};

  const handler = (evt: MessageEvent<BroadcastSyncMessage>) => {
    try {
      const data = evt.data;
      if (data && data.sourceId !== TAB_INSTANCE_ID && data.type) {
        callback(data.type);
      }
    } catch {
      // ignore malformed messages
    }
  };

  channel.addEventListener("message", handler);
  return () => {
    channel.removeEventListener("message", handler);
  };
}
