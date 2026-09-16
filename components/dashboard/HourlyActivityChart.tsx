"use client";

import { useMemo } from "react";
import { Zap } from "lucide-react";
import type { AnalyticsHourlyActivityDTO } from "@/lib/api/types";
import styles from "./HourlyActivityChart.module.scss";

interface Props {
  data: AnalyticsHourlyActivityDTO[];
}

export function HourlyActivityChart({ data }: Props) {
  const { maxMinutes, peakHour, totalActiveMinutes } = useMemo(() => {
    let max = 0;
    let peak: AnalyticsHourlyActivityDTO | null = null;
    let total = 0;

    for (const item of data) {
      total += item.minutes;
      if (item.minutes > max) {
        max = item.minutes;
        peak = item;
      }
    }

    return {
      maxMinutes: Math.max(max, 1),
      peakHour: max > 0 ? peak : null,
      totalActiveMinutes: total,
    };
  }, [data]);

  return (
    <div className={styles.container}>
      <div className={styles.peakHeader}>
        <span>24-Hour Focus Distribution</span>
        {peakHour ? (
          <span className={styles.peakBadge}>
            <Zap size={11} />
            Peak: {peakHour.label} ({peakHour.minutes}m logged)
          </span>
        ) : (
          <span style={{ fontSize: "11px", color: "#a1a1aa" }}>No hourly activity recorded yet</span>
        )}
      </div>

      <div className={styles.barsWrapper}>
        {data.map((item) => {
          const heightPercent = maxMinutes > 0 ? Math.round((item.minutes / maxMinutes) * 100) : 0;
          const isPeak = peakHour?.hour === item.hour && item.minutes > 0;
          const isEmpty = item.minutes === 0;

          return (
            <div key={item.hour} className={styles.barCol}>
              <div className={styles.tooltip}>
                <strong>{item.label}</strong>: {item.minutes}m ({item.sessionCount} session{item.sessionCount === 1 ? "" : "s"})
              </div>
              <div className={styles.barTrack}>
                <div
                  className={`${styles.bar} ${isPeak ? styles.isPeak : ""} ${isEmpty ? styles.empty : ""}`}
                  style={{ height: `${Math.max(isEmpty ? 4 : 8, heightPercent)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className={styles.labelsRow}>
        <span>12 AM</span>
        <span>3 AM</span>
        <span>6 AM</span>
        <span>9 AM</span>
        <span>12 PM</span>
        <span>3 PM</span>
        <span>6 PM</span>
        <span>9 PM</span>
        <span>11 PM</span>
      </div>
    </div>
  );
}
