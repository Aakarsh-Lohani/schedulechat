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
  scheduledTaskId?: string | null;
  labels: string[];
  order: number;
}

export interface TimerSlotDTO {
  id: string;
  taskId: string;
  taskTitle: string;
  isScheduledTask?: boolean;
  status: "countdown" | "running";
  startedAt: string;
  countdownEndsAt: string | null;
  plannedDurationSeconds: number;
  extendedBySeconds: number;
}

export interface ActiveTimersDTO {
  slots: Record<"1" | "2", TimerSlotDTO | null>;
  completedSecondsTodayBase: number;
  totalUsageSeconds: number;
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

export interface ConversationDTO {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatReplyDTO {
  reply: string;
  proposals: { id: string; type: string; summary: string; status: string }[];
  conversationId?: string;
  conversationTitle?: string;
}

export interface ScheduledTaskDTO {
  id: string;
  title: string;
  description: string;
  startTime: string;
  durationMinutes: number;
  timezone: string;
  recurrenceRule: string;
  recurrenceLabel: string;
  reminderMinutes: number;
  enabled: boolean;
  syncToGoogleCalendar: boolean;
  googleEventId: string | null;
  createdAt: string;
}

export interface AnalyticsTimelinePointDTO {
  date: string;
  label: string;
  actualHours: number;
  plannedHours: number;
  actualMinutes: number;
  plannedMinutes: number;
}

export interface AnalyticsOverrunTaskDTO {
  id: string;
  title: string;
  tabName: string;
  status: string;
  progressPercent: number;
  estimateMinutes: number;
  trackedMinutes: number;
  overrunMinutes: number;
  isOverrun: boolean;
  percentOfEstimate: number;
}

export interface AnalyticsTabDistributionDTO {
  name: string;
  hours: number;
  minutes: number;
}

export interface AnalyticsLabelDistributionDTO {
  name: string;
  hours: number;
  minutes: number;
}

export interface AnalyticsHourlyActivityDTO {
  hour: number;
  label: string;
  minutes: number;
  sessionCount: number;
}

export interface AnalyticsAllTaskDTO {
  id: string;
  title: string;
  tabName: string;
  status: string;
  progressPercent: number;
  estimateMinutes: number;
  trackedMinutes: number;
  overrunMinutes: number;
  isOverrun: boolean;
  percentOfEstimate: number;
  labels: string[];
}

export interface AnalyticsDataDTO {
  metrics: {
    todaySeconds: number;
    thisWeekSeconds: number;
    thisMonthSeconds: number;
    allTimeSeconds: number;
    activeTasksCount: number;
    completedTasksCount: number;
    upcomingTasksCount: number;
    totalTasksCount: number;
  };
  timelines: {
    "7d": AnalyticsTimelinePointDTO[];
    "14d": AnalyticsTimelinePointDTO[];
    "30d": AnalyticsTimelinePointDTO[];
  };
  overrunTasks: AnalyticsOverrunTaskDTO[];
  allTasks: AnalyticsAllTaskDTO[];
  tabDistribution: AnalyticsTabDistributionDTO[];
  labelDistribution: AnalyticsLabelDistributionDTO[];
  hourlyActivity: AnalyticsHourlyActivityDTO[];
  updatedAt: string;
}


