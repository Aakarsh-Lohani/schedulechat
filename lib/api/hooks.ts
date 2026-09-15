"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/fetcher";
import type { TabDTO, TaskDTO, ActiveTimersDTO, AIActionDTO, ChatReplyDTO, AnalyticsDataDTO, ConversationDTO } from "@/lib/api/types";

// ---- Tabs ----

export function useTabs() {
  return useQuery({
    queryKey: ["tabs"],
    queryFn: () => apiFetch<{ tabs: TabDTO[] }>("/api/tabs").then((r) => r.tabs),
  });
}

export function useCreateTab() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => apiFetch<{ tab: TabDTO }>("/api/tabs", { method: "POST", body: JSON.stringify({ name }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tabs"] }),
  });
}

export function useUpdateTab() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...fields }: { id: string; name?: string; order?: number }) =>
      apiFetch<{ tab: TabDTO }>(`/api/tabs/${id}`, { method: "PATCH", body: JSON.stringify(fields) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tabs"] });
    },
  });
}

export function useDeleteTab() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch("/api/tabs/" + id, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tabs"] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["calendar-tasks"] });
    },
  });
}

// ---- Tasks ----

interface TaskFilter {
  tabId?: string;
  scheduledToday?: boolean;
  from?: string;
  to?: string;
  tzOffset?: number;
}

function taskQueryString(filter: TaskFilter): string {
  const params = new URLSearchParams();
  if (filter.tabId) params.set("tabId", filter.tabId);
  if (filter.scheduledToday) {
    params.set("scheduledToday", "true");
    params.set("tzOffset", String(filter.tzOffset ?? new Date().getTimezoneOffset()));
  }
  if (filter.from) params.set("from", filter.from);
  if (filter.to) params.set("to", filter.to);
  return params.toString();
}

export function useTasks(
  filter: TaskFilter,
  queryKeySuffix: string,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: ["tasks", queryKeySuffix],
    queryFn: () => apiFetch<{ tasks: TaskDTO[] }>(`/api/tasks?${taskQueryString(filter)}`).then((r) => r.tasks),
    enabled: options?.enabled,
  });
}

export function useCalendarTasks(from: string, to: string) {
  return useQuery({
    queryKey: ["calendar-tasks", from, to],
    queryFn: () => apiFetch<{ tasks: TaskDTO[] }>(`/api/tasks?${taskQueryString({ from, to })}`).then((r) => r.tasks),
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<TaskDTO> & { tabId: string; title: string }) =>
      apiFetch<{ task: TaskDTO }>("/api/tasks", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["calendar-tasks"] });
    },
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...fields }: { id: string } & Partial<TaskDTO>) =>
      apiFetch<{ task: TaskDTO }>(`/api/tasks/${id}`, { method: "PATCH", body: JSON.stringify(fields) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["calendar-tasks"] });
    },
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/api/tasks/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["calendar-tasks"] });
    },
  });
}

// ---- Timers ----

export function useActiveTimers() {
  return useQuery({
    queryKey: ["timers", "active"],
    queryFn: () => apiFetch<ActiveTimersDTO>("/api/timers/active"),
    refetchInterval: 5000,
  });
}

export function useStartTimer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { taskId: string; slot: 1 | 2 }) =>
      apiFetch("/api/timers/start", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["timers", "active"] }),
  });
}

export function useConfirmStartTimer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/api/timers/${id}/confirm-start`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["timers", "active"] }),
  });
}

export function useCancelTimer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/api/timers/${id}/cancel`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["timers", "active"] }),
  });
}

export function useExtendTimer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, seconds }: { id: string; seconds: number }) =>
      apiFetch(`/api/timers/${id}/extend`, { method: "POST", body: JSON.stringify({ seconds }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["timers", "active"] }),
  });
}

export function useStopTimer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (arg: string | { id: string; followed?: boolean; discardTime?: boolean }) => {
      const id = typeof arg === "string" ? arg : arg.id;
      const body = typeof arg === "object" ? JSON.stringify({ followed: arg.followed, discardTime: arg.discardTime }) : undefined;
      return apiFetch(`/api/timers/${id}/stop`, { method: "POST", body });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["timers", "active"] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["calendar-tasks"] });
    },
  });
}

// ---- AI actions ----

export function useAiActions() {
  return useQuery({
    queryKey: ["ai-actions"],
    queryFn: () => apiFetch<{ actions: AIActionDTO[] }>("/api/ai-actions").then((r) => r.actions),
  });
}

export function useApproveAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/api/ai-actions/${id}/approve`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ai-actions"] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["calendar-tasks"] });
      qc.invalidateQueries({ queryKey: ["tabs"] });
    },
  });
}

export function useRejectAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/api/ai-actions/${id}/reject`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai-actions"] }),
  });
}

export function useUndoAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/api/ai-actions/${id}/undo`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ai-actions"] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["calendar-tasks"] });
      qc.invalidateQueries({ queryKey: ["tabs"] });
    },
  });
}

// ---- Chat & Conversations ----

export function useConversations() {
  return useQuery({
    queryKey: ["conversations"],
    queryFn: () => apiFetch<{ conversations: ConversationDTO[] }>("/api/chat/conversations").then((r) => r.conversations),
  });
}

export function useCreateConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (title?: string) =>
      apiFetch<{ conversation: ConversationDTO }>("/api/chat/conversations", {
        method: "POST",
        body: JSON.stringify({ title }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["conversations"] }),
  });
}

export function useDeleteConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch("/api/chat/conversations/" + id, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["conversations"] });
      qc.invalidateQueries({ queryKey: ["chat-history"] });
    },
  });
}

export function useUpdateConversationTitle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      apiFetch<{ conversation: ConversationDTO }>(`/api/chat/conversations/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ title }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}

export function useChatHistory(conversationId?: string | null) {
  return useQuery({
    queryKey: ["chat-history", conversationId ?? "default"],
    queryFn: () => {
      const url = conversationId ? `/api/chat/history?conversationId=${conversationId}` : "/api/chat/history";
      return apiFetch<{ messages: { role: "user" | "assistant"; content: string }[] }>(url).then((r) => r.messages);
    },
  });
}

export function useSendChat() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { message: string; mode: "suggest" | "update"; model?: string; conversationId?: string | null }) =>
      apiFetch<ChatReplyDTO>("/api/chat", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ai-actions"] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}

// ---- Google Calendar ----

export function useGoogleCalendarStatus() {
  return useQuery({
    queryKey: ["google-calendar-status"],
    queryFn: () =>
      apiFetch<{ isConfigured: boolean; connected: boolean; email?: string }>("/api/calendar/google/status"),
  });
}

export function useDisconnectGoogleCalendar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<{ success: boolean }>("/api/calendar/google/disconnect", { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["google-calendar-status"] });
      qc.invalidateQueries({ queryKey: ["scheduled-tasks"] });
    },
  });
}

// ---- Scheduled Tasks ----

export function useScheduledTasks() {
  return useQuery({
    queryKey: ["scheduled-tasks"],
    queryFn: () =>
      apiFetch<{ scheduledTasks: import("./types").ScheduledTaskDTO[] }>("/api/scheduled-tasks").then(
        (r) => r.scheduledTasks
      ),
  });
}

export function useCreateScheduledTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (
      input: Partial<import("./types").ScheduledTaskDTO> & {
        title: string;
        startTime: string;
        recurrenceRule: string;
      }
    ) =>
      apiFetch<{ scheduledTask: import("./types").ScheduledTaskDTO }>("/api/scheduled-tasks", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scheduled-tasks"] });
      qc.invalidateQueries({ queryKey: ["calendar-tasks"] });
    },
  });
}

export function useUpdateScheduledTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...fields }: { id: string } & Partial<import("./types").ScheduledTaskDTO>) =>
      apiFetch<{ scheduledTask: import("./types").ScheduledTaskDTO }>(`/api/scheduled-tasks/${id}`, {
        method: "PATCH",
        body: JSON.stringify(fields),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scheduled-tasks"] });
      qc.invalidateQueries({ queryKey: ["calendar-tasks"] });
    },
  });
}

export function useDeleteScheduledTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ success: boolean }>(`/api/scheduled-tasks/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scheduled-tasks"] });
      qc.invalidateQueries({ queryKey: ["calendar-tasks"] });
    },
  });
}

// ---- Analytics ----

export function useAnalytics(tzOffset?: number) {
  const offset = tzOffset ?? new Date().getTimezoneOffset();
  return useQuery({
    queryKey: ["analytics", offset],
    queryFn: () => apiFetch<AnalyticsDataDTO>(`/api/analytics?tzOffset=${offset}`),
    refetchInterval: 60000,
  });
}


