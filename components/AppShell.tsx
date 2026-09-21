"use client";

import {
  DndContext,
  MouseSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  pointerWithin,
  rectIntersection,
  type CollisionDetection,
  type DragEndEvent,
} from "@dnd-kit/core";
import { useRealtimeSync } from "@/lib/realtime/useRealtimeSync";
import { useUIStore } from "@/lib/store/uiStore";
import { useStartTimer, useUpdateTask } from "@/lib/api/hooks";
import { TimerBar } from "@/components/timers/TimerBar";
import { TabNav } from "@/components/board/TabNav";
import { TaskColumn } from "@/components/board/TaskColumn";
import { CalendarView } from "@/components/calendar/CalendarView";
import { ScheduledTasksView } from "@/components/scheduled/ScheduledTasksView";
import { AlarmDialog } from "@/components/scheduled/AlarmDialog";
import { useScheduledTaskAlarms } from "@/lib/scheduled/useScheduledTaskAlarms";
import { DashboardView } from "@/components/dashboard/DashboardView";
import { GoalsView } from "@/components/goals/GoalsView";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { ErrorPopup } from "@/components/ui/ErrorPopup";
import styles from "./AppShell.module.scss";

const customCollisionDetection: CollisionDetection = (args) => {
  // First check if pointer is directly within a droppable (e.g. timer:1, timer:2, today, tab:...)
  const pointerCollisions = pointerWithin(args);
  if (pointerCollisions.length > 0) {
    return pointerCollisions;
  }
  return rectIntersection(args);
};

export function AppShell() {
  useRealtimeSync();
  const { view, setView, chatPanelOpen } = useUIStore();
  const updateTask = useUpdateTask();
  const startTimer = useStartTimer();
  const { activeAlarm, handleStartInSlot, handleSnooze, handleDismiss } = useScheduledTaskAlarms();

  const mouseSensor = useSensor(MouseSensor, {
    activationConstraint: {
      distance: 8,
    },
  });

  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: {
      delay: 250,
      tolerance: 5,
    },
  });

  const keyboardSensor = useSensor(KeyboardSensor);

  const sensors = useSensors(mouseSensor, touchSensor, keyboardSensor);

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
    <DndContext sensors={sensors} collisionDetection={customCollisionDetection} onDragEnd={handleDragEnd}>
      <div className={styles.app}>
        <TimerBar />
        <TabNav view={view} onChangeView={setView} />
        <div className={styles.main}>
          <div className={styles.viewContainer}>
            {view === "dashboard" ? (
              <DashboardView />
            ) : view === "goals" ? (
              <GoalsView />
            ) : view === "calendar" ? (
              <CalendarView />
            ) : view === "scheduled" ? (
              <ScheduledTasksView />
            ) : (
              <TaskColumn view={view} />
            )}
          </div>
          {chatPanelOpen && <ChatPanel />}
        </div>
        {activeAlarm && (
          <AlarmDialog
            item={activeAlarm}
            onStartInSlot={handleStartInSlot}
            onSnooze={handleSnooze}
            onDismiss={handleDismiss}
          />
        )}
        <ErrorPopup />
      </div>
    </DndContext>
  );
}
