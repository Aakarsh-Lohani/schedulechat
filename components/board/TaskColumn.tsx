"use client";

import { useState } from "react";
import { useDndMonitor, useDroppable, type DragEndEvent } from "@dnd-kit/core";
import { useTabs, useTasks, useUpdateTask } from "@/lib/api/hooks";
import { TaskCard } from "./TaskCard";
import { TaskModal } from "./TaskModal";
import type { TaskDTO } from "@/lib/api/types";
import type { BoardView } from "@/lib/store/uiStore";
import styles from "./TaskColumn.module.scss";

function CardSlot({ task, onOpen }: { task: TaskDTO; onOpen: (task: TaskDTO) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: `taskslot:${task.id}` });
  return (
    <div ref={setNodeRef} className={isOver ? styles.reorderTarget : undefined}>
      <TaskCard task={task} onOpen={onOpen} />
    </div>
  );
}

export function TaskColumn({ view }: { view: BoardView }) {
  const { data: tabs } = useTabs();
  const isToday = view === "today";
  const filter = isToday ? { scheduledToday: true } : { tabId: view };
  const { data: tasks, isLoading } = useTasks(filter, view);
  const updateTask = useUpdateTask();
  const [editing, setEditing] = useState<TaskDTO | null>(null);
  const [creating, setCreating] = useState(false);

  const tabName = isToday ? "Today's Tasks" : tabs?.find((t) => t.id === view)?.name ?? "…";

  // Drag-to-reorder: dropping one card onto another WITHIN this same view swaps
  // their `order` values. Scoped naturally — this only fires when both the dragged
  // and target task are present in this column's own `tasks` list.
  useDndMonitor({
    onDragEnd(event: DragEndEvent) {
      const activeId = String(event.active.id);
      const overId = event.over ? String(event.over.id) : null;
      if (!overId || !activeId.startsWith("task:") || !overId.startsWith("taskslot:")) return;

      const draggedId = activeId.slice("task:".length);
      const targetId = overId.slice("taskslot:".length);
      if (draggedId === targetId) return;

      const dragged = tasks?.find((t) => t.id === draggedId);
      const target = tasks?.find((t) => t.id === targetId);
      if (!dragged || !target) return;

      updateTask.mutate({ id: dragged.id, order: target.order });
      updateTask.mutate({ id: target.id, order: dragged.order });
    },
  });

  return (
    <div className={styles.board}>
      <h2 className={styles.heading}>
        {tabName}
        <button type="button" className={styles.newBtn} onClick={() => setCreating(true)}>
          + New task
        </button>
      </h2>
      <p className={styles.sub}>
        {isToday
          ? "Auto-populated from scheduled date · drag onto a timer to start tracking · drop on another card to reorder"
          : "Drag a card onto another tab, Today's Tasks, a timer slot, or another card to reorder"}
      </p>

      {isLoading ? (
        <p className={styles.empty}>Loading…</p>
      ) : tasks && tasks.length > 0 ? (
        <div className={styles.cards}>
          {tasks.map((task) => (
            <CardSlot key={task.id} task={task} onOpen={setEditing} />
          ))}
        </div>
      ) : (
        <p className={styles.empty}>Nothing here yet.</p>
      )}

      {(creating || editing) && (
        <TaskModal
          task={editing}
          defaultTabId={isToday ? tabs?.[0]?.id : view}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}
