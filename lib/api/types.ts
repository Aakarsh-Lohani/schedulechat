export interface TabDTO {
  id: string;
  name: string;
  isSystemDefault: boolean;
  order: number;
}

export interface TaskDTO {
  id: string;
  tabId: string;
  title: string;
  description?: string;
  source: "manual" | "ai-suggested";
  aiAccepted: boolean;
  status: "not-started" | "in-progress" | "done" | "archived";
  estimateMinutes: number;
  defaultTimerMinutes: number;
  progressPercent: number;
  totalTrackedSeconds: number;
  scheduledDate: string | null;
  startDate: string | null;
  endDate: string | null;
  order: number;
}

export interface TimerSlotDTO {
  id: string;
  taskId: string;
  taskTitle: string;
  status: "countdown" | "running";
  startedAt: string;
  countdownEndsAt: string | null;
  plannedDurationSeconds: number;
  extendedBySeconds: number;
}

export interface ActiveTimersDTO {
  slots: Record<"1" | "2", TimerSlotDTO | null>;
  completedSecondsTodayBase: number;
}

export interface AIActionDTO {
  id: string;
  type: string;
  summary: string;
  status: "proposed" | "approved" | "rejected" | "executed" | "undone";
  createdAt: string;
  executedAt: string | null;
  undoneAt: string | null;
}

export interface ChatReplyDTO {
  reply: string;
  proposals: { id: string; type: string; summary: string; status: string }[];
}
