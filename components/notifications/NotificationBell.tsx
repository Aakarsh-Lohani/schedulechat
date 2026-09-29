"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, Check, Clock, X, Loader2 } from "lucide-react";
import {
  useNotifications,
  useNotificationAction,
  useActiveTimers,
  type NotificationDTO,
} from "@/lib/api/hooks";
import { formatTimeOfDay } from "@/lib/calendar/recurrence";
import styles from "./NotificationBell.module.scss";

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data } = useNotifications();
  const { data: activeTimers } = useActiveTimers();
  const notificationAction = useNotificationAction();

  const notifications = data?.notifications ?? [];

  // Helper to determine active timer slot for a scheduled task if running
  function getRunningSlot(scheduledTaskId: string): 1 | 2 | null {
    if (activeTimers?.slots["1"]?.scheduledTaskId === scheduledTaskId) return 1;
    if (activeTimers?.slots["2"]?.scheduledTaskId === scheduledTaskId) return 2;
    return null;
  }

  // Count only notifications that require user confirmation (routine ended/auto-stopped without manual stop)
  const pendingCount = notifications.filter((n) => {
    if (n.status !== "pending") return false;
    if (getRunningSlot(n.scheduledTaskId)) return false;
    const [startH, startM] = (n.startTime || "00:00").split(":").map(Number);
    const now = new Date();
    const nowMins = now.getHours() * 60 + now.getMinutes();
    const taskStartMins = (startH ?? 0) * 60 + (startM ?? 0);
    return nowMins >= taskStartMins;
  }).length;

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open]);

  function handleApprove(n: NotificationDTO) {
    if (notificationAction.isPending) return;
    notificationAction.mutate({ id: n.id, action: "approve" });
  }

  function handleReject(n: NotificationDTO) {
    if (notificationAction.isPending) return;
    notificationAction.mutate({ id: n.id, action: "reject" });
  }

  function handleDismiss(n: NotificationDTO) {
    if (notificationAction.isPending) return;
    notificationAction.mutate({ id: n.id, action: "dismiss" });
  }

  return (
    <div className={styles.container} ref={containerRef}>
      <button
        type="button"
        className={`${styles.bellBtn} ${open ? styles.active : ""}`}
        onClick={() => setOpen((prev) => !prev)}
        title="Scheduled task notifications"
        aria-label="Scheduled task notifications"
      >
        <Bell size={15} />
        {pendingCount > 0 && <span className={styles.badge}>{pendingCount}</span>}
      </button>

      {open && (
        <div className={styles.dropdown}>
          <div className={styles.dropdownHeader}>
            <h4>
              <Bell size={14} />
              Scheduled Tasks
            </h4>
            {pendingCount > 0 && (
              <span className={styles.headerBadge}>{pendingCount} pending</span>
            )}
          </div>

          <div className={styles.list}>
            {notifications.length === 0 ? (
              <div className={styles.empty}>No scheduled task alerts for today</div>
            ) : (
              notifications.map((n) => {
                const runningSlot = getRunningSlot(n.scheduledTaskId);
                const [startH, startM] = (n.startTime || "00:00").split(":").map(Number);
                const now = new Date();
                const nowMins = now.getHours() * 60 + now.getMinutes();
                const taskStartMins = (startH ?? 0) * 60 + (startM ?? 0);
                const isUpcoming = nowMins < taskStartMins;

                return (
                  <div key={n.id} className={`${styles.item} ${styles[n.status]}`}>
                    <div className={styles.itemHeader}>
                      <h5 className={styles.itemTitle}>{n.title}</h5>
                      {n.status === "pending" && !runningSlot && (
                        <button
                          type="button"
                          className={styles.actionBtn + " " + styles.dismiss}
                          onClick={() => handleDismiss(n)}
                          disabled={notificationAction.isPending}
                          title="Dismiss"
                        >
                          <X size={12} />
                        </button>
                      )}
                    </div>

                    <div className={styles.itemMeta}>
                      <span className={styles.metaSpan}>
                        <Clock size={11} />
                        {formatTimeOfDay(n.startTime)}
                      </span>
                      <span>{n.durationMinutes}m planned</span>
                    </div>

                    {n.status === "pending" ? (
                      runningSlot ? (
                        <div className={`${styles.statusBadge} ${styles.running}`}>
                          <Loader2 size={11} className="animate-spin" />
                          Running in Timer {runningSlot}
                        </div>
                      ) : isUpcoming ? (
                        <div className={`${styles.statusBadge} ${styles.upcoming}`}>
                          <Clock size={11} />
                          Upcoming at {formatTimeOfDay(n.startTime)}
                        </div>
                      ) : (
                        <div className={styles.actions}>
                          <span className={styles.confirmPrompt}>Followed routine?</span>
                          <button
                            type="button"
                            className={`${styles.actionBtn} ${styles.approve}`}
                            onClick={() => handleApprove(n)}
                            disabled={notificationAction.isPending}
                            title="Yes, count scheduled duration"
                          >
                            {notificationAction.isPending ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                            Yes (+{n.durationMinutes}m)
                          </button>
                          <button
                            type="button"
                            className={`${styles.actionBtn} ${styles.reject}`}
                            onClick={() => handleReject(n)}
                            disabled={notificationAction.isPending}
                            title="No, mark not followed (0m)"
                          >
                            <X size={11} />
                            No (0m)
                          </button>
                        </div>
                      )
                    ) : (
                      <div className={`${styles.statusBadge} ${styles[n.status]}`}>
                        {n.status === "approved" && (
                          <>
                            <Check size={11} />
                            Completed (+{n.durationMinutes}m tracked)
                          </>
                        )}
                        {n.status === "rejected" && (
                          <>
                            <X size={11} />
                            Not followed (0m tracked)
                          </>
                        )}
                        {n.status === "cancelled" && <>Cancelled for today</>}
                        {n.status === "dismissed" && <>Dismissed</>}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
