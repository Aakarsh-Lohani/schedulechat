"use client";

import { useMemo, useState } from "react";
import { Search, CheckCircle2, AlertTriangle, Filter } from "lucide-react";
import type { AnalyticsAllTaskDTO } from "@/lib/api/types";
import styles from "./AllTasksTable.module.scss";

interface Props {
  tasks: AnalyticsAllTaskDTO[];
}

type BudgetFilter = "all" | "over" | "within";

export function AllTasksTable({ tasks }: Props) {
  const [search, setSearch] = useState("");
  const [budgetFilter, setBudgetFilter] = useState<BudgetFilter>("all");
  const [selectedLabel, setSelectedLabel] = useState<string>("all");

  // Extract all distinct labels
  const distinctLabels = useMemo(() => {
    const set = new Set<string>();
    for (const t of tasks) {
      for (const l of t.labels) {
        set.add(l);
      }
    }
    return Array.from(set).sort();
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      // Search text
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesTitle = t.title.toLowerCase().includes(q);
        const matchesTab = t.tabName.toLowerCase().includes(q);
        const matchesLabel = t.labels.some((l) => l.toLowerCase().includes(q));
        if (!matchesTitle && !matchesTab && !matchesLabel) return false;
      }

      // Budget filter
      if (budgetFilter === "over" && !t.isOverrun) return false;
      if (budgetFilter === "within" && t.isOverrun) return false;

      // Label filter
      if (selectedLabel !== "all") {
        if (!t.labels.includes(selectedLabel)) return false;
      }

      return true;
    });
  }, [tasks, search, budgetFilter, selectedLabel]);

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <div className={styles.filterGroup}>
          <div className={styles.searchBox}>
            <Search size={13} />
            <input
              type="text"
              placeholder="Search tasks or labels..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <button
            type="button"
            className={`${styles.filterBtn} ${budgetFilter === "all" ? styles.active : ""}`}
            onClick={() => setBudgetFilter("all")}
          >
            All Budget
          </button>
          <button
            type="button"
            className={`${styles.filterBtn} ${budgetFilter === "over" ? styles.active : ""}`}
            onClick={() => setBudgetFilter("over")}
          >
            Over Budget
          </button>
          <button
            type="button"
            className={`${styles.filterBtn} ${budgetFilter === "within" ? styles.active : ""}`}
            onClick={() => setBudgetFilter("within")}
          >
            Within Budget
          </button>

          {distinctLabels.length > 0 && (
            <select
              className={styles.labelSelect}
              value={selectedLabel}
              onChange={(e) => setSelectedLabel(e.target.value)}
            >
              <option value="all">All Labels</option>
              {distinctLabels.map((lbl) => (
                <option key={lbl} value={lbl}>
                  Label: {lbl}
                </option>
              ))}
            </select>
          )}
        </div>

        <span className={styles.countLabel}>
          Showing {filteredTasks.length} of {tasks.length} tasks
        </span>
      </div>

      <div className={styles.tableWrapper}>
        {filteredTasks.length === 0 ? (
          <div className={styles.emptyState}>No tasks match the selected filters.</div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Task</th>
                <th>Tab / Project</th>
                <th>Status</th>
                <th>Tracked / Est.</th>
                <th>Budget Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredTasks.map((t) => (
                <tr key={t.id}>
                  <td>
                    <div className={styles.taskCell}>
                      <span className={styles.taskTitle}>{t.title}</span>
                      {t.labels.length > 0 && (
                        <div className={styles.labelsList}>
                          {t.labels.map((lbl) => (
                            <span key={lbl} className={styles.labelChip}>
                              {lbl}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </td>
                  <td>
                    <span className={styles.tabBadge}>{t.tabName}</span>
                  </td>
                  <td>
                    <span
                      className={`${styles.statusBadge} ${
                        t.status === "done"
                          ? styles.done
                          : t.status === "in-progress"
                          ? styles.inProgress
                          : styles.notStarted
                      }`}
                    >
                      {t.status === "not-started" ? "To Do" : t.status}
                    </span>
                  </td>
                  <td className={styles.timeCell}>
                    {t.trackedMinutes}m / {t.estimateMinutes}m
                  </td>
                  <td>
                    <div className={styles.budgetCell}>
                      <div className={styles.progressBar}>
                        <div
                          className={`${styles.progressFill} ${
                            t.isOverrun ? styles.overrun : styles.normal
                          }`}
                          style={{ width: `${Math.min(100, t.percentOfEstimate)}%` }}
                        />
                      </div>
                      {t.isOverrun ? (
                        <span className={`${styles.budgetBadge} ${styles.overrun}`}>
                          +{t.overrunMinutes}m over ({t.percentOfEstimate}%)
                        </span>
                      ) : (
                        <span className={`${styles.budgetBadge} ${styles.within}`}>
                          Within budget ({t.percentOfEstimate}%)
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
