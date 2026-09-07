"use client";

import { useState } from "react";
import { useCreateTask, useTabs, useUpdateTask } from "@/lib/api/hooks";
import type { TaskDTO } from "@/lib/api/types";
import styles from "./TaskModal.module.scss";

interface Props {
  task?: TaskDTO | null;
  defaultTabId?: string;
  defaultScheduledDate?: string;
  onClose: () => void;
}

/** Convert an ISO date string (or null) to the value format used by datetime-local inputs. */
function toDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  // datetime-local expects YYYY-MM-DDTHH:MM
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function TaskModal({ task, defaultTabId, defaultScheduledDate, onClose }: Props) {
  const { data: tabs } = useTabs();
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();

  const [title, setTitle] = useState(task?.title ?? "");
  const [tabId, setTabId] = useState(task?.tabId ?? defaultTabId ?? tabs?.[0]?.id ?? "");
  const [estimateMinutes, setEstimateMinutes] = useState(task?.estimateMinutes ?? 30);
  const [defaultTimerMinutes, setDefaultTimerMinutes] = useState(task?.defaultTimerMinutes ?? 30);
  const [description, setDescription] = useState(task?.description ?? "");
  const [scheduledDate, setScheduledDate] = useState(
    toDatetimeLocalValue(task?.scheduledDate ?? (task ? undefined : defaultScheduledDate))
  );

  async function handleSave() {
    if (!title.trim() || !tabId) return;

    const scheduledDateISO = scheduledDate ? new Date(scheduledDate).toISOString() : null;

    if (task) {
      await updateTask.mutateAsync({
        id: task.id,
        title,
        tabId,
        estimateMinutes,
        defaultTimerMinutes,
        description,
        scheduledDate: scheduledDateISO,
      });
    } else {
      await createTask.mutateAsync({
        title,
        tabId,
        estimateMinutes,
        defaultTimerMinutes,
        description,
        scheduledDate: scheduledDateISO,
      });
    }
    onClose();
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={styles.modal}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h3 className={styles.heading}>{task ? "Edit task" : "New task"}</h3>

        <label className={styles.field}>
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </label>

        <label className={styles.field}>
          Tab
          <select value={tabId} onChange={(e) => setTabId(e.target.value)}>
            {tabs?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>

        <div className={styles.row}>
          <label className={styles.field}>
            Estimate (min)
            <input type="number" min={1} value={estimateMinutes} onChange={(e) => setEstimateMinutes(Number(e.target.value))} />
          </label>
          <label className={styles.field}>
            Timer default (min)
            <input
              type="number"
              min={1}
              value={defaultTimerMinutes}
              onChange={(e) => setDefaultTimerMinutes(Number(e.target.value))}
            />
          </label>
        </div>

        <label className={styles.field}>
          Scheduled date
          <input
            type="datetime-local"
            value={scheduledDate}
            onChange={(e) => setScheduledDate(e.target.value)}
          />
        </label>

        <label className={styles.field}>
          Notes
          <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>

        <div className={styles.actions}>
          <button type="button" className={styles.cancel} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={styles.save} onClick={handleSave}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
