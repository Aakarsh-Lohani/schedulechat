import { create } from "zustand";

export type BoardView = "dashboard" | "today" | "scheduled" | "calendar" | string; // string = a tabId

interface UIState {
  view: BoardView;
  setView: (view: BoardView) => void;

  chatMode: "suggest" | "update";
  setChatMode: (mode: "suggest" | "update") => void;

  chatPanelOpen: boolean;
  toggleChatPanel: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  view: "dashboard",
  setView: (view) => set({ view }),

  chatMode: "update",
  setChatMode: (chatMode) => set({ chatMode }),

  chatPanelOpen: true,
  toggleChatPanel: () => set((s) => ({ chatPanelOpen: !s.chatPanelOpen })),
}));
