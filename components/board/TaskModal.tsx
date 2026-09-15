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
  const [status, setStatus] = useState<"not-started" | "in-progress" | "done" | "archived">(
    task?.status ?? "not-started"
  );
  const [scheduledDate, setScheduledDate] = useState(
    toDatetimeLocalValue(task?.scheduledDate ?? (task ? undefined : defaultScheduledDate))
  );
  const [labels, setLabels] = useState<string[]>(task?.labels ?? []);
  const [labelInput, setLabelInput] = useState("");

  async function handleSave() {
    if (!title.trim() || !tabId) return;

    const scheduledDateISO = scheduledDate ? new Date(scheduledDate).toISOString() : null;

    if (task) {
      await updateTask.mutateAsync({
        id: task.id,
        title,
        tabId,
        status,
        estimateMinutes,
        defaultTimerMinutes,
        description,
        scheduledDate: scheduledDateISO,
        labels,
      });
    } else {
      await createTask.mutateAsync({
        title,
        tabId,
        status,
        estimateMinutes,
        defaultTimerMinutes,
        description,
        scheduledDate: scheduledDateISO,
        labels,
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

        <label className={styles.field}>
          State
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as "not-started" | "in-progress" | "done" | "archived")}
          >
            <option value="not-started">Upcoming / To Do</option>
            <option value="in-progress">Active</option>
            <option value="done">Completed</option>
            <option value="archived">Archived</option>
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

        <div className={styles.field}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
            <span>Scheduled date (optional)</span>
            {scheduledDate && (
              <button
                type="button"
                style={{
                  background: "none",
                  border: "none",
                  color: "#a1a1aa",
                  fontSize: "11px",
                  cursor: "pointer",
                  padding: 0,
                  textDecoration: "underline",
                }}
                onClick={() => setScheduledDate("")}
                title="Remove date to keep in Upcoming / To Do"
              >
                Clear date
              </button>
            )}
          </div>
          <input
            type="datetime-local"
            value={scheduledDate}
            onChange={(e) => setScheduledDate(e.target.value)}
          />
        </div>

        <div className={styles.field}>
          <span>Labels</span>
          {labels.length > 0 && (
            <div className={styles.labelChips}>
              {labels.map((lbl) => (
                <span key={lbl} className={styles.modalLabelChip}>
                  {lbl}
                  <button
                    type="button"
                    className={styles.removeLabelBtn}
                    onClick={() => setLabels(labels.filter((l) => l !== lbl))}
                    title="Remove label"
                  >
                    &times;
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className={styles.addLabelRow}>
            <input
              type="text"
              placeholder="Add a label and press Enter..."
              value={labelInput}
              onChange={(e) => setLabelInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const val = labelInput.trim();
                  if (val && !labels.includes(val)) {
                    setLabels([...labels, val]);
                    setLabelInput("");
                  }
                }
              }}
            />
            <button
              type="button"
              className={styles.addLabelBtn}
              onClick={() => {
                const val = labelInput.trim();
                if (val && !labels.includes(val)) {
                  setLabels([...labels, val]);
                  setLabelInput("");
                }
              }}
            >
              Add
            </button>
          </div>
        </div>

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
