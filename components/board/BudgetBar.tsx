"use client";

import { budgetStatus, formatDuration } from "@/lib/timers/budget";
import styles from "./BudgetBar.module.scss";

export function BudgetBar({ totalTrackedSeconds, estimateMinutes }: { totalTrackedSeconds: number; estimateMinutes: number }) {
  const { color, fillPercent, overSeconds } = budgetStatus(totalTrackedSeconds, estimateMinutes);

  return (
    <div className={styles.budget}>
      <div className={styles.track}>
        <div className={`${styles.fill} ${styles[color]}`} style={{ width: `${fillPercent}%` }} />
        {color !== "green" && overSeconds > 0 && <div className={styles.overflow} />}
      </div>
      <div className={styles.labels}>
        <span>{formatDuration(totalTrackedSeconds)} tracked</span>
        <span className={color === "red" ? styles.over : color === "orange" ? styles.warn : undefined}>
          {estimateMinutes}m est.
          {overSeconds > 0 ? ` · +${formatDuration(overSeconds)} over` : ""}
        </span>
      </div>
    </div>
  );
}
