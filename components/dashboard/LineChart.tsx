"use client";

import { useState, useRef } from "react";
import type { AnalyticsTimelinePointDTO } from "@/lib/api/types";
import styles from "./LineChart.module.scss";

interface LineChartProps {
  data: AnalyticsTimelinePointDTO[];
  showPlannedToggle?: boolean;
}

interface Point {
  x: number;
  y: number;
}

// Compute cubic Bezier control point for smooth curves
function getControlPoint(
  current: Point,
  previous?: Point,
  next?: Point,
  reverse?: boolean
): Point {
  const p = previous || current;
  const n = next || current;
  const smoothing = 0.18;
  const opposedLine = {
    length: Math.hypot(n.x - p.x, n.y - p.y),
    angle: Math.atan2(n.y - p.y, n.x - p.x),
  };
  const angle = opposedLine.angle + (reverse ? Math.PI : 0);
  const length = opposedLine.length * smoothing;
  const x = current.x + Math.cos(angle) * length;
  const y = current.y + Math.sin(angle) * length;
  return { x, y };
}

function createSvgCurve(points: Point[]): string {
  if (points.length === 0) return "";
  const first = points[0];
  if (!first) return "";
  if (points.length === 1) return `M ${first.x} ${first.y}`;
  return points.reduce((acc, point, i, a) => {
    if (i === 0) return `M ${point.x},${point.y}`;
    const prev = a[i - 1] ?? point;
    const prevPrev = a[i - 2];
    const next = a[i + 1];
    const cp1 = getControlPoint(prev, prevPrev, point);
    const cp2 = getControlPoint(point, prev, next, true);
    return `${acc} C ${cp1.x.toFixed(1)},${cp1.y.toFixed(1)} ${cp2.x.toFixed(1)},${cp2.y.toFixed(1)} ${point.x.toFixed(1)},${point.y.toFixed(1)}`;
  }, "");
}

function formatDurationShort(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function LineChart({ data, showPlannedToggle = true }: LineChartProps) {
  const [showPlanned, setShowPlanned] = useState(true);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  if (!data || data.length === 0) {
    return <div className={styles.emptyState}>No activity recorded for this period yet.</div>;
  }

  // Chart dimensions in SVG viewBox coordinate space
  const svgWidth = 700;
  const svgHeight = 240;
  const padding = { top: 25, right: 30, bottom: 40, left: 45 };

  const chartWidth = svgWidth - padding.left - padding.right;
  const chartHeight = svgHeight - padding.top - padding.bottom;
  const chartBottomY = padding.top + chartHeight;

  // Maximum value calculation with headroom
  const maxActual = Math.max(...data.map((d) => d.actualHours), 0);
  const maxPlanned = showPlanned ? Math.max(...data.map((d) => d.plannedHours), 0) : 0;
  const rawMax = Math.max(maxActual, maxPlanned, 1);
  const yMax = Math.ceil(rawMax * 1.15 * 2) / 2; // round up to nearest 0.5h

  // Compute point coordinates
  const stepX = data.length > 1 ? chartWidth / (data.length - 1) : chartWidth / 2;

  const actualPoints: Point[] = data.map((d, i) => ({
    x: padding.left + i * stepX,
    y: padding.top + chartHeight - (d.actualHours / yMax) * chartHeight,
  }));

  const plannedPoints: Point[] = data.map((d, i) => ({
    x: padding.left + i * stepX,
    y: padding.top + chartHeight - (d.plannedHours / yMax) * chartHeight,
  }));

  // SVG Paths
  const actualLinePath = createSvgCurve(actualPoints);
  const plannedLinePath = createSvgCurve(plannedPoints);

  const firstActual = actualPoints[0];
  const lastActual = actualPoints[actualPoints.length - 1];
  const actualAreaPath =
    actualPoints.length > 1 && firstActual && lastActual
      ? `${actualLinePath} L ${lastActual.x},${chartBottomY} L ${firstActual.x},${chartBottomY} Z`
      : "";

  // Y-axis grid ticks (4 grid lines)
  const yTicks = [0, yMax * 0.33, yMax * 0.66, yMax].map((val) => ({
    val,
    y: padding.top + chartHeight - (val / yMax) * chartHeight,
    label: `${val.toFixed(val % 1 === 0 ? 0 : 1)}h`,
  }));

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!svgRef.current || data.length === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const relativeX = ((e.clientX - rect.left) / rect.width) * svgWidth;

    if (relativeX < padding.left - 10 || relativeX > svgWidth - padding.right + 10) {
      setHoverIndex(null);
      return;
    }

    const clampedX = Math.max(padding.left, Math.min(svgWidth - padding.right, relativeX));
    const rawIdx = (clampedX - padding.left) / stepX;
    const closestIdx = Math.max(0, Math.min(data.length - 1, Math.round(rawIdx)));
    setHoverIndex(closestIdx);
  }

  const activePoint = hoverIndex !== null ? data[hoverIndex] : null;
  const activeActualPos = hoverIndex !== null ? actualPoints[hoverIndex] : null;

  // Tooltip position in percentage of SVG wrapper
  const tooltipLeftPercent = activeActualPos ? (activeActualPos.x / svgWidth) * 100 : 50;
  const tooltipTopPercent = activeActualPos ? (activeActualPos.y / svgHeight) * 100 : 50;

  return (
    <div className={styles.container}>
      <div className={styles.chartHeader}>
        <div className={styles.legend}>
          <div className={styles.legendItem}>
            <span className={`${styles.legendLine} ${styles.actual}`} />
            <span>Actual Focus Time</span>
          </div>
          {showPlannedToggle && (
            <div
              className={`${styles.legendItem} ${!showPlanned ? styles.inactive : ""}`}
              onClick={() => setShowPlanned(!showPlanned)}
              title="Toggle Planned line"
            >
              <span className={`${styles.legendLine} ${styles.planned}`} />
              <span>Planned Target</span>
            </div>
          )}
        </div>
      </div>

      <div className={styles.svgWrapper}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoverIndex(null)}
        >
          <defs>
            <linearGradient id="actualGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#5aa9f7" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#5aa9f7" stopOpacity="0.0" />
            </linearGradient>
            <linearGradient id="plannedGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.12" />
              <stop offset="100%" stopColor="#a78bfa" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Grid lines and Y axis */}
          {yTicks.map((tick, i) => (
            <g key={i}>
              <line
                x1={padding.left}
                y1={tick.y}
                x2={svgWidth - padding.right}
                y2={tick.y}
                className={styles.gridLine}
              />
              <text
                x={padding.left - 10}
                y={tick.y + 3}
                textAnchor="end"
                className={styles.axisText}
              >
                {tick.label}
              </text>
            </g>
          ))}

          {/* Area fill under actual curve */}
          {actualAreaPath && (
            <path d={actualAreaPath} fill="url(#actualGradient)" />
          )}

          {/* Planned target dashed line */}
          {showPlanned && (
            <path
              d={plannedLinePath}
              fill="none"
              stroke="#a78bfa"
              strokeWidth="1.8"
              strokeDasharray="4 4"
            />
          )}

          {/* Actual focus time smooth curve */}
          <path
            d={actualLinePath}
            fill="none"
            stroke="#5aa9f7"
            strokeWidth="2.5"
            strokeLinecap="round"
          />

          {/* X Axis Date Labels */}
          {data.map((d, i) => {
            // For dense 30-day views, display every 5th label; for 14d every 2nd; for 7d display all
            const showLabel =
              data.length <= 7 ||
              (data.length <= 14 && (i % 2 === 0 || i === data.length - 1)) ||
              (data.length > 14 && (i % 5 === 0 || i === data.length - 1));

            if (!showLabel) return null;
            const x = padding.left + i * stepX;
            return (
              <text key={i} x={x} y={svgHeight - 12} className={styles.xLabel}>
                {d.label}
              </text>
            );
          })}

          {/* Crosshair guide line and dots on active point */}
          {hoverIndex !== null && activeActualPos && (
            <g>
              <line
                x1={activeActualPos.x}
                y1={padding.top}
                x2={activeActualPos.x}
                y2={chartBottomY}
                className={styles.crosshair}
              />
              {showPlanned && plannedPoints[hoverIndex] && (
                <circle
                  cx={plannedPoints[hoverIndex].x}
                  cy={plannedPoints[hoverIndex].y}
                  r="4.5"
                  fill="#a78bfa"
                  stroke="#1b1f26"
                  strokeWidth="2"
                />
              )}
              <circle
                cx={activeActualPos.x}
                cy={activeActualPos.y}
                r="5.5"
                fill="#5aa9f7"
                stroke="#1b1f26"
                strokeWidth="2.5"
                className={`${styles.dataDot} ${styles.active}`}
              />
            </g>
          )}
        </svg>

        {/* Floating Tooltip */}
        {activePoint && hoverIndex !== null && (
          <div
            className={styles.tooltip}
            style={{
              left: `${tooltipLeftPercent}%`,
              top: `${tooltipTopPercent}%`,
            }}
          >
            <div className={styles.tooltipTitle}>{activePoint.label} ({activePoint.date})</div>
            <div className={styles.tooltipRow}>
              <span className={styles.label}>
                <span className={`${styles.legendDot} ${styles.actual}`} />
                Actual
              </span>
              <span className={styles.value}>{formatDurationShort(activePoint.actualMinutes)}</span>
            </div>
            {showPlanned && (
              <div className={styles.tooltipRow}>
                <span className={styles.label}>
                  <span className={`${styles.legendDot} ${styles.planned}`} />
                  Planned
                </span>
                <span className={styles.value}>{formatDurationShort(activePoint.plannedMinutes)}</span>
              </div>
            )}
            {showPlanned && activePoint.plannedMinutes > 0 && (
              <div className={styles.tooltipDelta}>
                <span>Delta</span>
                <span
                  className={
                    activePoint.actualMinutes >= activePoint.plannedMinutes
                      ? styles.positive
                      : styles.negative
                  }
                >
                  {activePoint.actualMinutes >= activePoint.plannedMinutes ? "+" : ""}
                  {formatDurationShort(activePoint.actualMinutes - activePoint.plannedMinutes)}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
