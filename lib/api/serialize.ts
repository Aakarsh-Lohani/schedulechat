interface LeanTaskLike {
  _id: unknown;
  tabId?: unknown;
  title: string;
  description?: string;
  source: string;
  aiAccepted: boolean;
  status: string;
  estimateMinutes: number;
  defaultTimerMinutes: number;
  progressPercent: number;
  totalTrackedSeconds: number;
  scheduledDate?: Date | null;
  startDate?: Date | null;
  endDate?: Date | null;
  labels?: string[];
  order: number;
}

interface LeanTimerSessionLike {
  _id: unknown;
  taskId?: unknown;
  scheduledTaskId?: unknown;
  slot: number;
  startedAt: Date;
  countdownEndsAt?: Date | null;
  plannedDurationSeconds: number;
  extendedBySeconds: number;
  status: string;
  contributedSeconds: number;
}

export function serializeTask(t: LeanTaskLike) {
  return {
    id: String(t._id),
    tabId: t.tabId ? String(t.tabId) : "",
    title: t.title,
    description: t.description,
    source: t.source,
    aiAccepted: t.aiAccepted,
    status: t.status,
    estimateMinutes: t.estimateMinutes,
    defaultTimerMinutes: t.defaultTimerMinutes,
    progressPercent: t.progressPercent,
    totalTrackedSeconds: t.totalTrackedSeconds,
    scheduledDate: t.scheduledDate,
    startDate: t.startDate,
    endDate: t.endDate,
    labels: Array.isArray(t.labels) ? t.labels : [],
    order: t.order,
  };
}

export function serializeSession(s: LeanTimerSessionLike) {
  return {
    id: String(s._id),
    taskId: s.taskId ? String(s.taskId) : s.scheduledTaskId ? String(s.scheduledTaskId) : "",
    slot: s.slot,
    startedAt: s.startedAt,
    countdownEndsAt: s.countdownEndsAt,
    plannedDurationSeconds: s.plannedDurationSeconds,
    extendedBySeconds: s.extendedBySeconds,
    status: s.status,
    contributedSeconds: s.contributedSeconds,
  };
}

