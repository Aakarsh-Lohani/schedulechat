"use client";

import { useMemo, useState } from "react";
import { useDndMonitor, useDroppable, type DragEndEvent } from "@dnd-kit/core";
import { Plus, Play, Calendar, CheckCircle2, ChevronDown, ChevronRight } from "lucide-react";
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

  // Collapsible section state
  const [openSections, setOpenSections] = useState({
    active: true,
    upcoming: true,
    completed: true,
  });

  function toggleSection(key: "active" | "upcoming" | "completed") {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  const tabName = isToday ? "Today's Tasks" : tabs?.find((t) => t.id === view)?.name ?? "…";

  // Group tasks by state and sort by date
  const { activeTasks, upcomingTasks, completedTasks } = useMemo(() => {
    const active: TaskDTO[] = [];
    const upcoming: TaskDTO[] = [];
    const completed: TaskDTO[] = [];

    for (const t of tasks ?? []) {
      if (t.status === "in-progress") {
        active.push(t);
      } else if (t.status === "done") {
        completed.push(t);
      } else {
        // "not-started" or "archived"
        upcoming.push(t);
      }
    }

    // Sort upcoming by scheduled date ascending (or order)
    upcoming.sort((a, b) => {
      if (a.scheduledDate && b.scheduledDate) {
        return new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime();
      }
      if (a.scheduledDate) return -1;
      if (b.scheduledDate) return 1;
      return a.order - b.order;
    });

    // Sort completed by most recently updated/completed (or order)
    completed.sort((a, b) => {
      const timeA = a.endDate ? new Date(a.endDate).getTime() : 0;
      const timeB = b.endDate ? new Date(b.endDate).getTime() : 0;
      return timeB - timeA;
    });

    return { activeTasks: active, upcomingTasks: upcoming, completedTasks: completed };
  }, [tasks]);

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
        <button
          type="button"
          className={styles.newBtn}
          onClick={() => setCreating(true)}
          style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}
        >
          <Plus size={14} /> New task
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
        <div className={styles.sections}>
          {/* 1. Active Tasks */}
          <div className={styles.section}>
            <button
              type="button"
              className={styles.sectionHeader}
              onClick={() => toggleSection("active")}
            >
              {openSections.active ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <Play size={13} style={{ color: "#a78bfa" }} />
              <span>Active Tasks</span>
              <span className={styles.countPill}>{activeTasks.length}</span>
            </button>
            {openSections.active && (
              activeTasks.length > 0 ? (
                <div className={styles.cards}>
                  {activeTasks.map((task) => (
                    <CardSlot key={task.id} task={task} onOpen={setEditing} />
                  ))}
                </div>
              ) : (
                <p className={styles.sectionEmpty}>No active tasks in progress.</p>
              )
            )}
          </div>

          {/* 2. Upcoming Tasks */}
          <div className={styles.section}>
            <button
              type="button"
              className={styles.sectionHeader}
              onClick={() => toggleSection("upcoming")}
            >
              {openSections.upcoming ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <Calendar size={13} style={{ color: "#60a5fa" }} />
              <span>Upcoming / To Do</span>
              <span className={styles.countPill}>{upcomingTasks.length}</span>
            </button>
            {openSections.upcoming && (
              upcomingTasks.length > 0 ? (
                <div className={styles.cards}>
                  {upcomingTasks.map((task) => (
                    <CardSlot key={task.id} task={task} onOpen={setEditing} />
                  ))}
                </div>
              ) : (
                <p className={styles.sectionEmpty}>No upcoming tasks scheduled.</p>
              )
            )}
          </div>

          {/* 3. Completed Tasks */}
          <div className={styles.section}>
            <button
              type="button"
              className={styles.sectionHeader}
              onClick={() => toggleSection("completed")}
            >
              {openSections.completed ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <CheckCircle2 size={13} style={{ color: "#34d399" }} />
              <span>Completed</span>
              <span className={styles.countPill}>{completedTasks.length}</span>
            </button>
            {openSections.completed && (
              completedTasks.length > 0 ? (
                <div className={styles.cards}>
                  {completedTasks.map((task) => (
                    <CardSlot key={task.id} task={task} onOpen={setEditing} />
                  ))}
                </div>
              ) : (
                <p className={styles.sectionEmpty}>No completed tasks yet.</p>
              )
            )}
          </div>
        </div>
      ) : (
        <p className={styles.empty}>Nothing here yet.</p>
      )}

      {(creating || editing) && (
        <TaskModal
          task={editing}
          defaultTabId={isToday ? tabs?.[0]?.id : view}
          defaultScheduledDate={isToday ? new Date().toISOString() : undefined}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}
