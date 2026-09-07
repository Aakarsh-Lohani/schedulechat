"use client";

import { useDraggable } from "@dnd-kit/core";
import { BudgetBar } from "./BudgetBar";
import { useUpdateTask } from "@/lib/api/hooks";
import type { TaskDTO } from "@/lib/api/types";
import styles from "./TaskCard.module.scss";

export function TaskCard({ task, onOpen }: { task: TaskDTO; onOpen: (task: TaskDTO) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `task:${task.id}`,
    data: { task },
  });
  const updateTask = useUpdateTask();

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  const scheduledLabel = task.scheduledDate
    ? new Date(task.scheduledDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : null;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${styles.card} ${isDragging ? styles.dragging : ""}`}
    >
      <div className={styles.top}>
        <span className={styles.dragHandle} {...listeners} {...attributes} title="Drag to reorder">
          ⠿
        </span>
        <span className={styles.title}>{task.title}</span>
        <button
          type="button"
          className={styles.editBtn}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => onOpen(task)}
          title="Edit task"
        >
          ✏️
        </button>
        <span className={`${styles.tag} ${task.source === "ai-suggested" ? styles.tagAi : ""}`}>
          {task.source === "ai-suggested" && !task.aiAccepted ? "AI suggested" : task.status}
        </span>
      </div>

      {task.source === "ai-suggested" && !task.aiAccepted && (
        <button
          type="button"
          className={styles.acceptBtn}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => updateTask.mutate({ id: task.id, aiAccepted: true })}
        >
          Accept suggestion
        </button>
      )}

      <BudgetBar totalTrackedSeconds={task.totalTrackedSeconds} estimateMinutes={task.estimateMinutes} />

      <div className={styles.progressRow}>
        <input
          className={styles.progressInput}
          type="range"
          min={0}
          max={100}
          value={task.progressPercent}
          onPointerDown={(e) => e.stopPropagation()}
          onChange={(e) => updateTask.mutate({ id: task.id, progressPercent: Number(e.target.value) })}
        />
        <span className={styles.progressPct}>{task.progressPercent}%</span>
      </div>

      <div className={styles.metaRow}>
        <span>timer: {task.defaultTimerMinutes}m</span>
        {scheduledLabel && <span>📅 {scheduledLabel}</span>}
        <span>{task.status}</span>
      </div>
    </div>
  );
}
