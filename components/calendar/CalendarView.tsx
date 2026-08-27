"use client";

import { useMemo, useState } from "react";
import { useDndMonitor, useDraggable, useDroppable, type DragEndEvent } from "@dnd-kit/core";
import { useCalendarTasks, useUpdateTask } from "@/lib/api/hooks";
import { budgetStatus } from "@/lib/timers/budget";
import { computeBarSpan, shiftTaskDates } from "@/lib/calendar/barSpan";
import { TaskModal } from "@/components/board/TaskModal";
import type { TaskDTO } from "@/lib/api/types";
import styles from "./CalendarView.module.scss";

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfWeek(d: Date): Date {
  const day = d.getDay(); // 0 = Sunday
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diffToMonday);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function fmtDay(d: Date): string {
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric" });
}

function DayCell({ taskId, dayIndex }: { taskId: string; dayIndex: number }) {
  const { setNodeRef, isOver } = useDroppable({ id: `calday:${taskId}:${dayIndex}` });
  return (
    <div
      ref={setNodeRef}
      className={styles.dayCell}
      style={{ gridColumn: dayIndex + 1, gridRow: 1, background: isOver ? "rgba(167,139,250,0.12)" : undefined }}
    />
  );
}

function Bar({ task, position, onOpen }: { task: TaskDTO; position: { start: number; span: number }; onOpen: (t: TaskDTO) => void }) {
  const { color } = budgetStatus(task.totalTrackedSeconds, task.estimateMinutes);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: `calbar:${task.id}` });

  const style: React.CSSProperties = {
    gridColumn: `${position.start} / span ${position.span}`,
    gridRow: 1,
    opacity: isDragging ? 0.5 : 1,
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
  };

  return (
    <button
      ref={setNodeRef}
      type="button"
      className={`${styles.bar} ${styles[color]} ${task.source === "ai-suggested" ? styles.ai : ""}`}
      style={style}
      onClick={() => !isDragging && onOpen(task)}
      {...listeners}
      {...attributes}
    >
      {task.estimateMinutes}m est.
    </button>
  );
}

export function CalendarView() {
  const [weekStart] = useState(() => startOfWeek(new Date()));
  const weekEnd = useMemo(() => new Date(weekStart.getTime() + 7 * DAY_MS - 1), [weekStart]);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => new Date(weekStart.getTime() + i * DAY_MS)), [weekStart]);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { data: tasks } = useCalendarTasks(weekStart.toISOString(), weekEnd.toISOString());
  const updateTask = useUpdateTask();
  const [editing, setEditing] = useState<TaskDTO | null>(null);

  useDndMonitor({
    onDragEnd(event: DragEndEvent) {
      const activeId = String(event.active.id);
      const overId = event.over ? String(event.over.id) : null;
      if (!overId || !activeId.startsWith("calbar:")) return;
      const taskId = activeId.slice("calbar:".length);
      if (!overId.startsWith(`calday:${taskId}:`)) return;

      const dayIndex = Number(overId.split(":")[2]);
      const task = (tasks ?? []).find((t) => t.id === taskId);
      if (!task) return;

      const { startDate, endDate } = shiftTaskDates(task, weekStart, dayIndex);
      updateTask.mutate({ id: taskId, startDate, endDate });
    },
  });

  const rows = (tasks ?? [])
    .map((task) => ({ task, position: computeBarSpan(task, weekStart, weekEnd) }))
    .filter((r): r is { task: TaskDTO; position: { start: number; span: number } } => r.position !== null);

  return (
    <div className={styles.wrap}>
      <h2 className={styles.heading}>Calendar</h2>
      <p className={styles.sub}>Bars driven by each task&apos;s start–end date · drag a bar to reschedule · color = budget status</p>

      {rows.length === 0 ? (
        <p className={styles.empty}>No tasks with dates this week yet — set a start/end date on a task to see it here.</p>
      ) : (
        <div className={styles.grid}>
          <div className={styles.header}>
            <div />
            {days.map((d) => (
              <div key={d.toISOString()} className={`${styles.dayLabel} ${d.getTime() === today.getTime() ? styles.today : ""}`}>
                {fmtDay(d)}
              </div>
            ))}
          </div>

          {rows.map(({ task, position }) => (
            <div key={task.id} className={styles.row}>
              <div className={styles.rowLabel}>{task.title}</div>
              <div className={styles.track}>
                {days.map((_, i) => (
                  <DayCell key={i} taskId={task.id} dayIndex={i} />
                ))}
                <Bar task={task} position={position} onOpen={setEditing} />
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && <TaskModal task={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
