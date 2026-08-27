"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/fetcher";
import type { TabDTO, TaskDTO, ActiveTimersDTO, AIActionDTO, ChatReplyDTO } from "@/lib/api/types";

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

// ---- Tasks ----

interface TaskFilter {
  tabId?: string;
  scheduledToday?: boolean;
  from?: string;
  to?: string;
}

function taskQueryString(filter: TaskFilter): string {
  const params = new URLSearchParams();
  if (filter.tabId) params.set("tabId", filter.tabId);
  if (filter.scheduledToday) params.set("scheduledToday", "true");
  if (filter.from) params.set("from", filter.from);
  if (filter.to) params.set("to", filter.to);
  return params.toString();
}

export function useTasks(filter: TaskFilter, queryKeySuffix: string) {
  return useQuery({
    queryKey: ["tasks", queryKeySuffix],
    queryFn: () => apiFetch<{ tasks: TaskDTO[] }>(`/api/tasks?${taskQueryString(filter)}`).then((r) => r.tasks),
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
    mutationFn: (id: string) => apiFetch(`/api/timers/${id}/stop`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["timers", "active"] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
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
    },
  });
}

// ---- Chat ----

export function useChatHistory() {
  return useQuery({
    queryKey: ["chat-history"],
    queryFn: () => apiFetch<{ messages: { role: "user" | "assistant"; content: string }[] }>("/api/chat/history").then((r) => r.messages),
    staleTime: Infinity, // only ever loaded once per session; new messages are appended locally
  });
}

export function useSendChat() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { message: string; mode: "suggest" | "update" }) =>
      apiFetch<ChatReplyDTO>("/api/chat", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai-actions"] }),
  });
}
