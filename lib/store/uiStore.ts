import { create } from "zustand";

export type BoardView = "dashboard" | "today" | "scheduled" | "calendar" | string; // string = a tabId

export interface ApiErrorInfo {
  error: string;
  code?: string;
  status?: number;
  raw?: unknown;
}

interface UIState {
  view: BoardView;
  setView: (view: BoardView) => void;

  chatMode: "suggest" | "update";
  setChatMode: (mode: "suggest" | "update") => void;

  chatPanelOpen: boolean;
  toggleChatPanel: () => void;

  copilotWidth: number;
  setCopilotWidth: (width: number) => void;

  activeError: ApiErrorInfo | null;
  showError: (error: ApiErrorInfo) => void;
  clearError: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  view: "dashboard",
  setView: (view) => set({ view }),

  chatMode: "update",
  setChatMode: (chatMode) => set({ chatMode }),

  chatPanelOpen: true,
  toggleChatPanel: () => set((s) => ({ chatPanelOpen: !s.chatPanelOpen })),

  copilotWidth: 380,
  setCopilotWidth: (width) => set({ copilotWidth: Math.max(280, Math.min(800, width)) }),

  activeError: null,
  showError: (activeError) => set({ activeError }),
  clearError: () => set({ activeError: null }),
}));

