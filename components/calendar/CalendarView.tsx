"use client";

import { useMemo, useState } from "react";
import { useDndMonitor, useDraggable, useDroppable, type DragEndEvent } from "@dnd-kit/core";
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Clock,
  Plus,
} from "lucide-react";
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
      onClick={(e) => {
        if (!isDragging) {
          e.stopPropagation();
          onOpen(task);
        }
      }}
      {...listeners}
      {...attributes}
    >
      {task.estimateMinutes}m est.
    </button>
  );
}

export function CalendarView() {
  const [viewMode, setViewMode] = useState<"calendar" | "timeline">("calendar");

  // Timeline week state
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const weekEnd = useMemo(() => new Date(weekStart.getTime() + 7 * DAY_MS - 1), [weekStart]);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => new Date(weekStart.getTime() + i * DAY_MS)), [weekStart]);

  // Date-wise Month calendar state
  const [currentMonth, setCurrentMonth] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Month boundary calculations
  const monthStart = useMemo(() => {
    const d = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [currentMonth]);

  const monthEnd = useMemo(() => {
    const d = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
    d.setHours(23, 59, 59, 999);
    return d;
  }, [currentMonth]);

  // Query range covers either the viewed month or the week
  const fromQuery = viewMode === "calendar" ? monthStart.toISOString() : weekStart.toISOString();
  const toQuery = viewMode === "calendar" ? monthEnd.toISOString() : weekEnd.toISOString();

  const { data: tasks } = useCalendarTasks(fromQuery, toQuery);
  const updateTask = useUpdateTask();

  const [editing, setEditing] = useState<TaskDTO | null>(null);
  const [creatingForDate, setCreatingForDate] = useState<string | null>(null);

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
      if (task.startDate === startDate && task.endDate === endDate) return;

      updateTask.mutate({ id: taskId, startDate, endDate });
    },
  });

  // Timeline bars calculation
  const rows = (tasks ?? [])
    .map((task) => ({ task, position: computeBarSpan(task, weekStart, weekEnd) }))
    .filter((r): r is { task: TaskDTO; position: { start: number; span: number } } => r.position !== null);

  // Month grid calculation
  const monthCells = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();

    const firstDayOfWeek = new Date(year, month, 1).getDay(); // 0 = Sun, 1 = Mon...
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const cells: Array<{ date: Date; isCurrentMonth: boolean }> = [];

    // Leading padding days from previous month
    const prevMonthDays = new Date(year, month, 0).getDate();
    for (let i = firstDayOfWeek - 1; i >= 0; i--) {
      cells.push({
        date: new Date(year, month - 1, prevMonthDays - i),
        isCurrentMonth: false,
      });
    }

    // Days in current month
    for (let day = 1; day <= daysInMonth; day++) {
      cells.push({
        date: new Date(year, month, day),
        isCurrentMonth: true,
      });
    }

    // Trailing padding days to fill 7 columns
    const totalSlots = Math.ceil(cells.length / 7) * 7;
    let nextDay = 1;
    while (cells.length < totalSlots) {
      cells.push({
        date: new Date(year, month + 1, nextDay++),
        isCurrentMonth: false,
      });
    }

    return cells;
  }, [currentMonth]);

  // Tasks mapped by date string for instant dot indicators
  const tasksByDate = useMemo(() => {
    const map = new Map<string, { scheduled: TaskDTO[]; done: TaskDTO[] }>();

    for (const t of tasks ?? []) {
      if (t.scheduledDate) {
        const dStr = new Date(t.scheduledDate).toDateString();
        const entry = map.get(dStr) ?? { scheduled: [], done: [] };
        if (t.status === "done") {
          entry.done.push(t);
        } else {
          entry.scheduled.push(t);
        }
        map.set(dStr, entry);
      } else if (t.status === "done" && t.endDate) {
        const dStr = new Date(t.endDate).toDateString();
        const entry = map.get(dStr) ?? { scheduled: [], done: [] };
        entry.done.push(t);
        map.set(dStr, entry);
      }
    }
    return map;
  }, [tasks]);

  // Selected date's tasks
  const selectedDateStr = selectedDate.toDateString();
  const selectedDateTasks = tasksByDate.get(selectedDateStr) ?? { scheduled: [], done: [] };
  const allSelectedTasks = [...selectedDateTasks.scheduled, ...selectedDateTasks.done];

  function handlePrevMonth() {
    setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  }

  function handleNextMonth() {
    setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  }

  function handleTodayMonth() {
    const d = new Date();
    setCurrentMonth(new Date(d.getFullYear(), d.getMonth(), 1));
    setSelectedDate(d);
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.topRow}>
        <div>
          <h2 className={styles.heading}>Calendar</h2>
          <p className={styles.sub}>
            {viewMode === "calendar"
              ? "Date-wise calendar view · click any date to view and manage tasks for that day"
              : "Timeline view · drag bars to reschedule · color indicates budget status"}
          </p>
        </div>

        <div className={styles.viewToggle}>
          <button
            type="button"
            className={`${styles.toggleBtn} ${viewMode === "calendar" ? styles.active : ""}`}
            onClick={() => setViewMode("calendar")}
          >
            Date Calendar
          </button>
          <button
            type="button"
            className={`${styles.toggleBtn} ${viewMode === "timeline" ? styles.active : ""}`}
            onClick={() => setViewMode("timeline")}
          >
            Week Timeline
          </button>
        </div>
      </div>

      {viewMode === "calendar" ? (
        <>
          {/* Month Navigator Controls */}
          <div className={styles.controls}>
            <button type="button" className={styles.navBtn} onClick={handlePrevMonth} title="Previous Month">
              <ChevronLeft size={16} />
            </button>
            <span className={styles.monthTitle}>
              {currentMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
            </span>
            <button type="button" className={styles.navBtn} onClick={handleNextMonth} title="Next Month">
              <ChevronRight size={16} />
            </button>
            <button type="button" className={styles.todayBtn} onClick={handleTodayMonth}>
              Today
            </button>
          </div>

          {/* 7-column Month Grid */}
          <div className={styles.monthGrid}>
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((dayName) => (
              <div key={dayName} className={styles.weekdayHeader}>
                {dayName}
              </div>
            ))}

            {monthCells.map(({ date, isCurrentMonth }, idx) => {
              const dStr = date.toDateString();
              const isTodayCell = dStr === today.toDateString();
              const isSelectedCell = dStr === selectedDateStr;
              const dateInfo = tasksByDate.get(dStr);

              const scheduledCount = dateInfo?.scheduled.length ?? 0;
              const doneCount = dateInfo?.done.length ?? 0;

              return (
                <div
                  key={idx}
                  className={`${styles.monthDayCell} ${!isCurrentMonth ? styles.otherMonth : ""} ${
                    isTodayCell ? styles.isToday : ""
                  } ${isSelectedCell ? styles.isSelected : ""}`}
                  onClick={() => setSelectedDate(date)}
                >
                  <span className={styles.dayNumber}>{date.getDate()}</span>
                  <div className={styles.dotContainer}>
                    {scheduledCount > 0 && (
                      <span className={styles.badgeScheduled} title={`${scheduledCount} scheduled`}>
                        {scheduledCount} sched
                      </span>
                    )}
                    {doneCount > 0 && (
                      <span className={styles.badgeDone} title={`${doneCount} completed`}>
                        {doneCount} done
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Selected Date Detail Pane */}
          <div className={styles.detailPane}>
            <div className={styles.detailHeader}>
              <div className={styles.detailTitle}>
                <CalendarIcon size={16} />
                <span>
                  Tasks on {selectedDate.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric", year: "numeric" })}
                </span>
              </div>
              <button
                type="button"
                className={styles.addTaskBtn}
                onClick={() => setCreatingForDate(selectedDate.toISOString())}
              >
                <Plus size={13} />
                Add task
              </button>
            </div>

            {allSelectedTasks.length === 0 ? (
              <p className={styles.empty}>
                No tasks scheduled or completed on this date. Click &quot;Add task&quot; to schedule one.
              </p>
            ) : (
              <div className={styles.detailList}>
                {allSelectedTasks.map((task) => (
                  <div
                    key={task.id}
                    className={styles.taskDetailCard}
                    onClick={() => setEditing(task)}
                    title="Click to view/edit full task details"
                  >
                    <div className={styles.taskDetailTop}>
                      <span className={styles.taskDetailTitle}>{task.title}</span>
                      <span
                        style={{
                          fontSize: "10.5px",
                          fontWeight: 700,
                          padding: "2px 6px",
                          borderRadius: "4px",
                          background: task.status === "done" ? "rgba(52,211,153,0.15)" : task.status === "in-progress" ? "rgba(167,139,250,0.15)" : "rgba(96,165,250,0.15)",
                          color: task.status === "done" ? "#34d399" : task.status === "in-progress" ? "#a78bfa" : "#60a5fa",
                        }}
                      >
                        {task.status}
                      </span>
                    </div>

                    <div className={styles.taskDetailMeta}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                        <Clock size={11} />
                        {task.estimateMinutes}m est.
                      </span>
                      <span>progress: {task.progressPercent}%</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      ) : (
        /* Timeline Gantt View */
        <>
          <div className={styles.controls}>
            <button
              type="button"
              className={styles.navBtn}
              onClick={() => setWeekStart((prev) => new Date(prev.getTime() - 7 * DAY_MS))}
              title="Previous Week"
            >
              <ChevronLeft size={16} />
            </button>
            <span className={styles.monthTitle}>
              Week of {weekStart.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – {weekEnd.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
            </span>
            <button
              type="button"
              className={styles.navBtn}
              onClick={() => setWeekStart((prev) => new Date(prev.getTime() + 7 * DAY_MS))}
              title="Next Week"
            >
              <ChevronRight size={16} />
            </button>
            <button
              type="button"
              className={styles.todayBtn}
              onClick={() => setWeekStart(startOfWeek(new Date()))}
            >
              This Week
            </button>
          </div>

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
                  <div
                    className={styles.rowLabel}
                    style={{ cursor: "pointer" }}
                    onClick={() => setEditing(task)}
                    title="Click to edit task"
                  >
                    {task.title}
                  </div>
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
        </>
      )}

      {/* Full Task Modal */}
      {(editing || creatingForDate) && (
        <TaskModal
          task={editing}
          defaultScheduledDate={creatingForDate ?? undefined}
          onClose={() => {
            setEditing(null);
            setCreatingForDate(null);
          }}
        />
      )}
    </div>
  );
}
