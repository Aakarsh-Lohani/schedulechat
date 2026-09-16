"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, Check, Clock, Play, X } from "lucide-react";
import {
  useNotifications,
  useNotificationAction,
  useActiveTimers,
  useStartTimer,
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
  const startTimer = useStartTimer();

  const notifications = data?.notifications ?? [];
  const pendingCount = notifications.filter((n) => n.status === "pending").length;

  // Determine available timer slot
  const slot1Free = !activeTimers?.slots["1"];
  const slot2Free = !activeTimers?.slots["2"];
  const availableSlot: 1 | 2 | null = slot1Free ? 1 : slot2Free ? 2 : null;

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

  function handleStart(n: NotificationDTO) {
    if (!availableSlot) {
      alert("Both timer slots are currently active. Stop one before starting this scheduled task.");
      return;
    }
    notificationAction.mutate({ id: n.id, action: "start", slot: availableSlot });
  }

  function handleApprove(n: NotificationDTO) {
    notificationAction.mutate({ id: n.id, action: "approve" });
  }

  function handleReject(n: NotificationDTO) {
    notificationAction.mutate({ id: n.id, action: "reject" });
  }

  function handleDismiss(n: NotificationDTO) {
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
              notifications.map((n) => (
                <div key={n.id} className={`${styles.item} ${styles[n.status]}`}>
                  <div className={styles.itemHeader}>
                    <h5 className={styles.itemTitle}>{n.title}</h5>
                    {n.status === "pending" && (
                      <button
                        type="button"
                        className={styles.actionBtn + " " + styles.dismiss}
                        onClick={() => handleDismiss(n)}
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
                    <div className={styles.actions}>
                      <button
                        type="button"
                        className={`${styles.actionBtn} ${styles.start}`}
                        onClick={() => handleStart(n)}
                        disabled={!availableSlot}
                        title={
                          availableSlot
                            ? `Start in Slot ${availableSlot}`
                            : "Both timer slots are full"
                        }
                      >
                        <Play size={10} fill="currentColor" />
                        Start Timer
                      </button>
                      <button
                        type="button"
                        className={`${styles.actionBtn} ${styles.approve}`}
                        onClick={() => handleApprove(n)}
                        title="Count scheduled duration in today's time"
                      >
                        <Check size={11} />
                        I did this
                      </button>
                      <button
                        type="button"
                        className={`${styles.actionBtn} ${styles.reject}`}
                        onClick={() => handleReject(n)}
                        title="Mark as not followed (0m)"
                      >
                        <X size={11} />
                        Did not do
                      </button>
                    </div>
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
                      {n.status === "dismissed" && <>Dismissed</>}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
