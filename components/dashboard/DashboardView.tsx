"use client";

import { useState } from "react";
import {
  RotateCcw,
  Clock,
  Calendar,
  AlertTriangle,
  FolderKanban,
  CheckCircle2,
  TrendingUp,
  Sparkles,
  Tag,
} from "lucide-react";
import { useAnalytics } from "@/lib/api/hooks";
import { formatTimeUsage } from "@/lib/analytics/metrics";
import { LineChart } from "./LineChart";
import { HourlyActivityChart } from "./HourlyActivityChart";
import { AllTasksTable } from "./AllTasksTable";
import styles from "./DashboardView.module.scss";

type TimelineRange = "7d" | "14d" | "30d";

export function DashboardView() {
  const [range, setRange] = useState<TimelineRange>("7d");
  const { data, isLoading, isFetching, refetch } = useAnalytics();

  if (isLoading || !data) {
    return (
      <div className={styles.loadingPlaceholder}>
        <RotateCcw size={18} className={styles.spinning} />
        <span>Loading analytics dashboard...</span>
      </div>
    );
  }

  const {
    metrics,
    timelines,
    tabDistribution,
    labelDistribution,
    hourlyActivity,
    allTasks,
    updatedAt,
  } = data;
  const currentTimeline = timelines[range] || [];

  const formattedUpdated = updatedAt
    ? new Date(updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "";

  // Compute maximum tab & label hours for relative progress calculation
  const maxTabHours = Math.max(...tabDistribution.map((t) => t.hours), 0.1);
  const maxLabelHours = Math.max(...(labelDistribution || []).map((l) => l.hours), 0.1);

  return (
    <div className={styles.container}>
      {/* Header with Title and Refresh */}
      <header className={styles.header}>
        <div className={styles.titleArea}>
          <h1>Focus &amp; Analytics Dashboard</h1>
          <p>Real-time tracked time, scheduled target curves, and overrun indicators</p>
        </div>
        <div className={styles.controls}>
          {formattedUpdated && (
            <span className={styles.lastUpdated}>Updated {formattedUpdated}</span>
          )}
          <button
            type="button"
            className={styles.refreshBtn}
            onClick={() => refetch()}
            disabled={isFetching}
            title="Refresh analytics data"
          >
            <RotateCcw size={14} className={isFetching ? styles.spinning : ""} />
            <span>Refresh</span>
          </button>
        </div>
      </header>

      {/* KPI Cards: Today, This Week, This Month, All Time */}
      <section className={styles.metricsGrid}>
        <div className={styles.metricCard}>
          <div className={styles.metricCardHeader}>
            <span>Today&apos;s Focus</span>
            <Clock size={16} />
          </div>
          <div className={styles.metricValue}>
            {formatTimeUsage(metrics.todaySeconds)}
          </div>
          <div className={styles.metricSubtitle}>
            <span className={styles.accentDot} />
            <span>{metrics.activeTasksCount} active task(s)</span>
          </div>
        </div>

        <div className={styles.metricCard}>
          <div className={styles.metricCardHeader}>
            <span>This Week</span>
            <Calendar size={16} />
          </div>
          <div className={styles.metricValue}>
            {formatTimeUsage(metrics.thisWeekSeconds)}
          </div>
          <div className={styles.metricSubtitle}>
            <span>Mon &ndash; Sun timeframe</span>
          </div>
        </div>

        <div className={styles.metricCard}>
          <div className={styles.metricCardHeader}>
            <span>This Month</span>
            <TrendingUp size={16} />
          </div>
          <div className={styles.metricValue}>
            {formatTimeUsage(metrics.thisMonthSeconds)}
          </div>
          <div className={styles.metricSubtitle}>
            <span>{metrics.completedTasksCount} completed tasks</span>
          </div>
        </div>

        <div className={styles.metricCard}>
          <div className={styles.metricCardHeader}>
            <span>All-Time Logged</span>
            <Sparkles size={16} />
          </div>
          <div className={styles.metricValue}>
            {formatTimeUsage(metrics.allTimeSeconds)}
          </div>
          <div className={styles.metricSubtitle}>
            <span>Across {metrics.totalTasksCount} total tasks</span>
          </div>
        </div>
      </section>

      {/* Interactive Line Chart Section */}
      <section className={styles.chartCard}>
        <div className={styles.chartTopBar}>
          <h2 className={styles.sectionHeading}>
            <TrendingUp size={16} />
            Focus Time Trends
          </h2>
          <div className={styles.rangeButtons}>
            <button
              type="button"
              className={`${styles.rangeBtn} ${range === "7d" ? styles.active : ""}`}
              onClick={() => setRange("7d")}
            >
              7 Days
            </button>
            <button
              type="button"
              className={`${styles.rangeBtn} ${range === "14d" ? styles.active : ""}`}
              onClick={() => setRange("14d")}
            >
              14 Days
            </button>
            <button
              type="button"
              className={`${styles.rangeBtn} ${range === "30d" ? styles.active : ""}`}
              onClick={() => setRange("30d")}
            >
              30 Days
            </button>
          </div>
        </div>

        <LineChart data={currentTimeline} />
      </section>

      {/* 24-Hour Activity Time Graph */}
      <section className={styles.chartCard}>
        <div className={styles.chartTopBar}>
          <h2 className={styles.sectionHeading}>
            <Clock size={16} />
            Daily Activity Time (Peak Focus Hours)
          </h2>
        </div>
        <HourlyActivityChart data={hourlyActivity || []} />
      </section>

      {/* Two Column Split: Tab Distribution & Label Distribution */}
      <div className={styles.splitRow}>
        {/* Section: Tab / Project Time Distribution */}
        <section className={styles.panelCard}>
          <div className={styles.chartTopBar}>
            <h2 className={styles.sectionHeading}>
              <FolderKanban size={16} />
              Distribution by Tab
            </h2>
          </div>

          {tabDistribution.length === 0 ? (
            <div className={styles.emptyNotice}>
              No tab focus data recorded yet.
            </div>
          ) : (
            <div className={styles.tabDistList}>
              {tabDistribution.map((tab) => {
                const percentage = maxTabHours > 0 ? (tab.hours / maxTabHours) * 100 : 0;
                return (
                  <div key={tab.name} className={styles.tabDistItem}>
                    <div className={styles.tabDistHeader}>
                      <span className={styles.name}>{tab.name}</span>
                      <span className={styles.hours}>
                        {tab.hours > 0 ? `${tab.hours}h` : `${tab.minutes}m`}
                      </span>
                    </div>
                    <div className={styles.tabBarWrapper}>
                      <div
                        className={styles.tabBarFill}
                        style={{ width: `${Math.max(4, Math.min(100, percentage))}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Section: Label Time Distribution */}
        <section className={styles.panelCard}>
          <div className={styles.chartTopBar}>
            <h2 className={styles.sectionHeading}>
              <Tag size={16} />
              Distribution by Label
            </h2>
          </div>

          {!labelDistribution || labelDistribution.length === 0 ? (
            <div className={styles.emptyNotice}>
              No label focus data recorded yet.
            </div>
          ) : (
            <div className={styles.tabDistList}>
              {labelDistribution.map((lbl) => {
                const percentage = maxLabelHours > 0 ? (lbl.hours / maxLabelHours) * 100 : 0;
                return (
                  <div key={lbl.name} className={styles.tabDistItem}>
                    <div className={styles.tabDistHeader}>
                      <span className={styles.name}>{lbl.name}</span>
                      <span className={styles.hours}>
                        {lbl.hours > 0 ? `${lbl.hours}h` : `${lbl.minutes}m`}
                      </span>
                    </div>
                    <div className={styles.tabBarWrapper}>
                      <div
                        className={styles.tabBarFill}
                        style={{
                          width: `${Math.max(4, Math.min(100, percentage))}%`,
                          background: "#c4b5fd",
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* All Tasks Table with search, budget filter, and label filter */}
      <section className={styles.panelCard}>
        <div className={styles.chartTopBar}>
          <h2 className={styles.sectionHeading}>
            <CheckCircle2 size={16} />
            All Tasks Overview &amp; Budget Tracking
          </h2>
        </div>
        <AllTasksTable tasks={allTasks || []} />
      </section>
    </div>
  );
}
