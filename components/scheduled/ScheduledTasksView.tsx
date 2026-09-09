"use client";

import { useState } from "react";
import {
  Plus,
  Clock,
  Calendar,
  Bell,
  Trash2,
  ExternalLink,
  Power,
} from "lucide-react";
import {
  useScheduledTasks,
  useCreateScheduledTask,
  useUpdateScheduledTask,
  useDeleteScheduledTask,
  useGoogleCalendarStatus,
  useDisconnectGoogleCalendar,
} from "@/lib/api/hooks";
import { buildRRule, type RecurrenceType } from "@/lib/calendar/recurrence";
import styles from "./ScheduledTasksView.module.scss";

const DAYS_OF_WEEK = [
  { day: 0, label: "Sun" },
  { day: 1, label: "Mon" },
  { day: 2, label: "Tue" },
  { day: 3, label: "Wed" },
  { day: 4, label: "Thu" },
  { day: 5, label: "Fri" },
  { day: 6, label: "Sat" },
];

export function ScheduledTasksView() {
  const { data: scheduledTasks, isLoading } = useScheduledTasks();
  const createScheduled = useCreateScheduledTask();
  const updateScheduled = useUpdateScheduledTask();
  const deleteScheduled = useDeleteScheduledTask();

  const { data: calendarStatus } = useGoogleCalendarStatus();
  const disconnectCalendar = useDisconnectGoogleCalendar();

  const [modalOpen, setModalOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startTime, setStartTime] = useState("19:00");
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [recurrenceType, setRecurrenceType] = useState<RecurrenceType>("daily");
  const [selectedDays, setSelectedDays] = useState<number[]>([1]); // default Mon
  const [reminderMinutes, setReminderMinutes] = useState(10);
  const [syncToGoogle, setSyncToGoogle] = useState(true);

  function toggleDay(day: number) {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()
    );
  }

  async function handleConnectGoogle() {
    try {
      const res = await fetch("/api/calendar/google/connect");
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error || "Google Calendar credentials are not configured in environment.");
      }
    } catch {
      alert("Failed to initiate Google Calendar connection.");
    }
  }

  async function handleSaveNewSeries() {
    if (!title.trim() || !startTime) return;

    let rruleDays = selectedDays;
    if (recurrenceType === "weekly" || recurrenceType === "biweekly") {
      rruleDays = [selectedDays[0] ?? 0];
    }

    const rrule = buildRRule({
      type: recurrenceType,
      daysOfWeek: rruleDays,
      intervalWeeks: recurrenceType === "biweekly" ? 2 : 1,
    });

    await createScheduled.mutateAsync({
      title: title.trim(),
      description: description.trim(),
      startTime,
      durationMinutes,
      recurrenceRule: rrule,
      reminderMinutes,
      syncToGoogleCalendar: syncToGoogle,
      enabled: true,
    });

    setModalOpen(false);
    setTitle("");
    setDescription("");
    setStartTime("19:00");
    setDurationMinutes(30);
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>Scheduled Tasks</h2>
          <p className={styles.sub}>
            Recurring task series · configured once, runs continuously · syncs natively with Google Calendar
          </p>
        </div>
        <button
          type="button"
          className={styles.newBtn}
          onClick={() => setModalOpen(true)}
        >
          <Plus size={14} />
          New scheduled task
        </button>
      </div>

      {/* Google Calendar Connection Card */}
      <div className={styles.calendarCard}>
        <div className={styles.calendarInfo}>
          <Calendar size={22} className={styles.calendarIcon} />
          <div className={styles.calendarDetails}>
            <span className={styles.calendarTitle}>
              {calendarStatus?.connected
                ? `Google Calendar: Connected (${calendarStatus.email})`
                : "Google Calendar: Not Connected"}
            </span>
            <span className={styles.calendarSub}>
              {calendarStatus?.connected
                ? "Recurring tasks sync directly to your Google Calendar with native popup reminder alerts."
                : "Connect your Google Calendar to schedule events automatically and receive reminders on your phone & desktop."}
            </span>
          </div>
        </div>

        <div>
          {calendarStatus?.connected ? (
            <button
              type="button"
              className={styles.disconnectBtn}
              onClick={() => disconnectCalendar.mutate()}
            >
              Disconnect
            </button>
          ) : (
            <button
              type="button"
              className={styles.calendarBtn}
              onClick={handleConnectGoogle}
            >
              <ExternalLink size={13} />
              Connect Google Calendar
            </button>
          )}
        </div>
      </div>

      {/* List of Scheduled Tasks */}
      {isLoading ? (
        <p className={styles.sub}>Loading scheduled tasks…</p>
      ) : scheduledTasks && scheduledTasks.length > 0 ? (
        <div className={styles.seriesGrid}>
          {scheduledTasks.map((task) => (
            <div
              key={task.id}
              className={`${styles.seriesCard} ${!task.enabled ? styles.disabled : ""}`}
            >
              <div className={styles.cardTop}>
                <h3 className={styles.cardTitle}>{task.title}</h3>
                <div className={styles.cardActions}>
                  <button
                    type="button"
                    className={styles.iconBtn}
                    onClick={() => updateScheduled.mutate({ id: task.id, enabled: !task.enabled })}
                    title={task.enabled ? "Pause series" : "Enable series"}
                  >
                    <Power size={14} style={{ color: task.enabled ? "#34d399" : "#a1a1aa" }} />
                  </button>
                  <button
                    type="button"
                    className={`${styles.iconBtn} ${styles.delete}`}
                    onClick={() => {
                      if (confirm(`Delete scheduled task "${task.title}"?`)) {
                        deleteScheduled.mutate(task.id);
                      }
                    }}
                    title="Delete scheduled task"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {task.description && <p className={styles.cardDesc}>{task.description}</p>}

              <div className={styles.badges}>
                <span className={`${styles.badge} ${styles.recurrence}`}>
                  <Clock size={11} />
                  {task.recurrenceLabel}
                </span>
                <span className={`${styles.badge} ${styles.duration}`}>
                  {task.durationMinutes} min
                </span>
                {task.reminderMinutes > 0 && (
                  <span className={`${styles.badge} ${styles.duration}`}>
                    <Bell size={11} />
                    {task.reminderMinutes}m reminder
                  </span>
                )}
                {task.syncToGoogleCalendar && (
                  <span className={`${styles.badge} ${styles.google}`}>
                    <Calendar size={11} />
                    {task.googleEventId ? "Synced to Google" : "Google Sync Enabled"}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className={styles.emptyState}>
          <Clock size={32} style={{ margin: "0 auto 10px", color: "#a1a1aa" }} />
          <p style={{ margin: "0 0 12px", fontWeight: 600 }}>No scheduled recurring tasks yet.</p>
          <p style={{ margin: 0, fontSize: "12px" }}>
            Create daily meetings, weekly contests, or recurring tasks to have them track automatically and sync to your calendar.
          </p>
        </div>
      )}

      {/* New Series Modal */}
      {modalOpen && (
        <div className={styles.modalOverlay} onClick={() => setModalOpen(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.modalHeading}>New Scheduled Task (Recurring Series)</h3>

            <label className={styles.field}>
              Title
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Daily Standup / LeetCode Contest / Sprint Review"
                autoFocus
              />
            </label>

            <div className={styles.formRow}>
              <label className={styles.field}>
                Start Time (24h)
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </label>

              <label className={styles.field}>
                Duration (minutes)
                <input
                  type="number"
                  min={5}
                  max={1440}
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(Number(e.target.value))}
                />
              </label>
            </div>

            <label className={styles.field}>
              Recurrence Pattern
              <select
                value={recurrenceType}
                onChange={(e) => setRecurrenceType(e.target.value as RecurrenceType)}
              >
                <option value="daily">Daily (Every day)</option>
                <option value="weekdays">Weekdays (Mon - Fri)</option>
                <option value="weekly">Weekly (Every week on selected day)</option>
                <option value="biweekly">Biweekly / Alternate Weeks (Every 2 weeks)</option>
                <option value="custom">Specific Days of Week (e.g. Mon, Wed, Fri)</option>
              </select>
            </label>

            {(recurrenceType === "weekly" || recurrenceType === "biweekly" || recurrenceType === "custom") && (
              <div className={styles.field}>
                <span>Select Day(s)</span>
                <div className={styles.daysRow}>
                  {DAYS_OF_WEEK.map(({ day, label }) => (
                    <button
                      key={day}
                      type="button"
                      className={`${styles.dayChip} ${selectedDays.includes(day) ? styles.active : ""}`}
                      onClick={() => {
                        if (recurrenceType === "weekly" || recurrenceType === "biweekly") {
                          setSelectedDays([day]);
                        } else {
                          toggleDay(day);
                        }
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className={styles.formRow}>
              <label className={styles.field}>
                Popup Reminder
                <select
                  value={reminderMinutes}
                  onChange={(e) => setReminderMinutes(Number(e.target.value))}
                >
                  <option value={0}>No reminder</option>
                  <option value={5}>5 minutes before</option>
                  <option value={10}>10 minutes before</option>
                  <option value={15}>15 minutes before</option>
                  <option value={30}>30 minutes before</option>
                  <option value={60}>1 hour before</option>
                </select>
              </label>

              <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: "8px" }}>
                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={syncToGoogle}
                    onChange={(e) => setSyncToGoogle(e.target.checked)}
                  />
                  Sync to Google Calendar
                </label>
              </div>
            </div>

            <label className={styles.field}>
              Notes / Description (optional)
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Meeting link, contest details, agenda..."
              />
            </label>

            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.cancelBtn}
                onClick={() => setModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.saveBtn}
                onClick={handleSaveNewSeries}
                disabled={!title.trim() || !startTime}
              >
                Save scheduled task
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
