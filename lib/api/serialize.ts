export function serializeTask(t: any) {
  return {
    id: String(t._id),
    tabId: String(t.tabId),
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
    order: t.order,
  };
}

export function serializeSession(s: any) {
  return {
    id: String(s._id),
    taskId: String(s.taskId),
    slot: s.slot,
    startedAt: s.startedAt,
    countdownEndsAt: s.countdownEndsAt,
    plannedDurationSeconds: s.plannedDurationSeconds,
    extendedBySeconds: s.extendedBySeconds,
    status: s.status,
    contributedSeconds: s.contributedSeconds,
  };
}
