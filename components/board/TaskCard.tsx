"use client";

import { useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import { Pencil, Calendar, GripVertical, Play, Check, RotateCcw } from "lucide-react";
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

  const [prevEstimate, setPrevEstimate] = useState(task.estimateMinutes);
  const [estMinutes, setEstMinutes] = useState(task.estimateMinutes);

  if (task.estimateMinutes !== prevEstimate) {
    setPrevEstimate(task.estimateMinutes);
    setEstMinutes(task.estimateMinutes);
  }

  function commitEstimate(val: number) {
    const clamped = Math.max(5, Math.min(1440, Math.round(val)));
    setEstMinutes(clamped);
    if (clamped !== task.estimateMinutes) {
      updateTask.mutate({ id: task.id, estimateMinutes: clamped });
    }
  }

  function handleAdjustEstimate(delta: number) {
    const newVal = Math.max(5, Math.min(1440, (task.estimateMinutes || 30) + delta));
    setEstMinutes(newVal);
    updateTask.mutate({ id: task.id, estimateMinutes: newVal });
  }

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        zIndex: isDragging ? 9999 : undefined,
        position: isDragging ? ("relative" as const) : undefined,
        pointerEvents: isDragging ? ("none" as const) : undefined,
      }
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
      <div className={styles.top} {...listeners} {...attributes}>
        <span className={styles.dragHandle} title="Drag to reorder or drag to timer">
          <GripVertical size={14} />
        </span>
        <span
          className={styles.title}
          style={{ cursor: "pointer" }}
          onClick={() => onOpen(task)}
          title="Click to edit task"
        >
          {task.title}
        </span>
        <button
          type="button"
          className={styles.editBtn}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => onOpen(task)}
          title="Edit task"
        >
          <Pencil size={12} color="#ffffff" />
        </button>
        <span className={`${styles.tag} ${task.source === "ai-suggested" ? styles.tagAi : ""}`}>
          {task.source === "ai-suggested" && !task.aiAccepted ? "AI suggested" : task.status}
        </span>
      </div>

      {task.labels && task.labels.length > 0 && (
        <div className={styles.labelRow}>
          {task.labels.map((lbl) => (
            <span key={lbl} className={styles.labelChip}>
              {lbl}
            </span>
          ))}
        </div>
      )}

      {task.source === "ai-suggested" && !task.aiAccepted && (
        <button
          type="button"
          className={styles.acceptBtn}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => updateTask.mutate({ id: task.id, aiAccepted: true })}
        >
          Accept suggestion
        </button>
      )}

      <BudgetBar totalTrackedSeconds={task.totalTrackedSeconds} estimateMinutes={task.estimateMinutes} />

      <div className={styles.estimateRow}>
        <span className={styles.estimateLabel}>Expected time</span>
        <div className={styles.estimateControls}>
          <button
            type="button"
            className={styles.estAdjBtn}
            title="Subtract 15 mins"
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => handleAdjustEstimate(-15)}
          >
            -15m
          </button>
          <input
            type="number"
            min={5}
            max={1440}
            step={5}
            className={styles.estimateInput}
            value={estMinutes}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onChange={(e) => setEstMinutes(Number(e.target.value))}
            onBlur={() => commitEstimate(estMinutes)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                commitEstimate(estMinutes);
                (e.target as HTMLInputElement).blur();
              }
            }}
            title="Expected duration in minutes"
          />
          <span className={styles.estUnit}>min</span>
          <button
            type="button"
            className={styles.estAdjBtn}
            title="Add 15 mins"
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => handleAdjustEstimate(15)}
          >
            +15m
          </button>
        </div>
      </div>

      <div className={styles.metaRow}>
        <span>timer: {task.defaultTimerMinutes}m</span>
        {scheduledLabel && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
            <Calendar size={12} />
            {scheduledLabel}
          </span>
        )}
        {task.status === "not-started" && (
          <button
            type="button"
            className={styles.stateBtn}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => updateTask.mutate({ id: task.id, status: "in-progress" })}
            title="Mark as Active"
          >
            <Play size={10} /> Start
          </button>
        )}
        {task.status === "in-progress" && (
          <button
            type="button"
            className={styles.stateBtn}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => updateTask.mutate({ id: task.id, status: "done", progressPercent: 100 })}
            title="Mark as Completed"
          >
            <Check size={10} /> Done
          </button>
        )}
        {task.status === "done" && (
          <button
            type="button"
            className={styles.stateBtn}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => updateTask.mutate({ id: task.id, status: "not-started" })}
            title="Reopen task"
          >
            <RotateCcw size={10} /> Reopen
          </button>
        )}
        {task.status === "archived" && <span>archived</span>}
      </div>
    </div>
  );
}
