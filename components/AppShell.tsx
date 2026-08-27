"use client";

import { DndContext, type DragEndEvent } from "@dnd-kit/core";
import { useRealtimeSync } from "@/lib/realtime/useRealtimeSync";
import { useUIStore } from "@/lib/store/uiStore";
import { useStartTimer, useUpdateTask } from "@/lib/api/hooks";
import { TimerBar } from "@/components/timers/TimerBar";
import { TabNav } from "@/components/board/TabNav";
import { TaskColumn } from "@/components/board/TaskColumn";
import { CalendarView } from "@/components/calendar/CalendarView";
import { ChatPanel } from "@/components/chat/ChatPanel";
import styles from "./AppShell.module.scss";

export function AppShell() {
  useRealtimeSync();
  const { view, setView, chatPanelOpen } = useUIStore();
  const updateTask = useUpdateTask();
  const startTimer = useStartTimer();

  function handleDragEnd(event: DragEndEvent) {
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : null;
    if (!overId || !activeId.startsWith("task:")) return;
    const taskId = activeId.slice("task:".length);

    if (overId === "today") {
      updateTask.mutate({ id: taskId, scheduledDate: new Date().toISOString() });
      return;
    }
    if (overId.startsWith("tab:")) {
      updateTask.mutate({ id: taskId, tabId: overId.slice("tab:".length) });
      return;
    }
    if (overId.startsWith("timer:")) {
      const slot = Number(overId.slice("timer:".length)) as 1 | 2;
      startTimer.mutate({ taskId, slot });
      return;
    }
  }

  return (
    <DndContext onDragEnd={handleDragEnd}>
      <div className={styles.app}>
        <TimerBar />
        <TabNav view={view} onChangeView={setView} />
        <div className={styles.main}>
          {view === "calendar" ? <CalendarView /> : <TaskColumn view={view} />}
          {chatPanelOpen && <ChatPanel />}
        </div>
      </div>
    </DndContext>
  );
}
