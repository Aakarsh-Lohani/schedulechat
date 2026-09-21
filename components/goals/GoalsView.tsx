"use client";

import { useState, useEffect } from "react";
import { Target, Save, Check, AlertCircle, Info, Edit3, Eye, Sparkles } from "lucide-react";
import { useGoalContext, useUpdateGoalContext } from "@/lib/api/hooks";
import { MarkdownContent } from "@/components/chat/MarkdownContent";
import styles from "./GoalsView.module.scss";

export function GoalsView() {
  const { data: goalContext, isLoading } = useGoalContext();
  const updateGoal = useUpdateGoalContext();

  const [userGoals, setUserGoals] = useState("");
  const [aiLog, setAiLog] = useState("");
  const [activeTabLeft, setActiveTabLeft] = useState<"edit" | "preview">("edit");
  const [activeTabRight, setActiveTabRight] = useState<"edit" | "preview">("preview");
  const [isDirty, setIsDirty] = useState(false);

  // Sync initial values once loaded
  useEffect(() => {
    if (goalContext && !isDirty) {
      setUserGoals(goalContext.userGoalsMarkdown || "");
      setAiLog(goalContext.aiSprintLog || "");
    }
  }, [goalContext, isDirty]);

  function handleUserGoalsChange(val: string) {
    setUserGoals(val);
    setIsDirty(true);
  }

  function handleAiLogChange(val: string) {
    setAiLog(val);
    setIsDirty(true);
  }

  async function handleSave() {
    await updateGoal.mutateAsync({
      userGoalsMarkdown: userGoals,
      aiSprintLog: aiLog,
    });
    setIsDirty(false);
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.titleArea}>
          <h1>
            <Target size={22} color="#a78bfa" />
            Goals & Strategy Notepad
          </h1>
          <p>
            Your long-term compass and AI sprint memory. The Copilot uses these guidelines and daily limits to plan your weekly sprints.
          </p>
        </div>

        <div className={styles.controls}>
          {isDirty && (
            <span className={`${styles.saveStatus} ${styles.saveStatusUnsaved}`}>
              <AlertCircle size={13} />
              Unsaved changes
            </span>
          )}
          {!isDirty && !updateGoal.isPending && (
            <span className={styles.saveStatus}>
              <Check size={13} color="#10b981" />
              Saved
            </span>
          )}

          <button
            type="button"
            className={styles.saveBtn}
            onClick={handleSave}
            disabled={!isDirty || updateGoal.isPending || isLoading}
          >
            <Save size={14} />
            {updateGoal.isPending ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </header>

      <div className={styles.tipCard}>
        <Info size={18} className={styles.tipIcon} />
        <div>
          <strong>How this works with your Copilot:</strong>
          <br />
          <strong>Section 1</strong> defines your 120-day syllabus, goals, and daily time ceiling (Max 8h weekdays, 10h weekends).
          <br />
          <strong>Section 2</strong> is where the Copilot records its retrospective notes, pacing decisions, and rollover tasks at the end of each sprint.
          You can edit either section at any time.
        </div>
      </div>

      <div className={styles.grid}>
        {/* Left Section: User Goals & Limits */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionTitle}>
              <Target size={16} color="#60a5fa" />
              <span>User Strategy & Daily Limits</span>
              <span className={`${styles.sectionBadge} ${styles.badgeReadOnly}`}>AI Read-Only</span>
            </div>

            <div className={styles.sectionActions}>
              <button
                type="button"
                className={`${styles.tabBtn} ${activeTabLeft === "edit" ? styles.active : ""}`}
                onClick={() => setActiveTabLeft("edit")}
              >
                <Edit3 size={12} style={{ display: "inline", marginRight: 4 }} />
                Edit
              </button>
              <button
                type="button"
                className={`${styles.tabBtn} ${activeTabLeft === "preview" ? styles.active : ""}`}
                onClick={() => setActiveTabLeft("preview")}
              >
                <Eye size={12} style={{ display: "inline", marginRight: 4 }} />
                Preview
              </button>
            </div>
          </div>

          <div className={styles.editorArea}>
            {activeTabLeft === "edit" ? (
              <textarea
                className={styles.textarea}
                value={userGoals}
                onChange={(e) => handleUserGoalsChange(e.target.value)}
                placeholder="List your 120-day goals, topic syllabus, and daily hours ceiling (e.g. 8h weekdays, 10h weekends)..."
              />
            ) : (
              <div className={styles.previewArea}>
                {userGoals.trim() ? (
                  <MarkdownContent content={userGoals} />
                ) : (
                  <p className={styles.emptyHint}>No goals written yet. Switch to Edit to add your syllabus and constraints.</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Section: AI Sprint Log & Memory */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionTitle}>
              <Sparkles size={16} color="#a78bfa" />
              <span>AI Sprint Memory & Log</span>
              <span className={`${styles.sectionBadge} ${styles.badgeAiLog}`}>AI Append-Only</span>
            </div>

            <div className={styles.sectionActions}>
              <button
                type="button"
                className={`${styles.tabBtn} ${activeTabRight === "preview" ? styles.active : ""}`}
                onClick={() => setActiveTabRight("preview")}
              >
                <Eye size={12} style={{ display: "inline", marginRight: 4 }} />
                Preview
              </button>
              <button
                type="button"
                className={`${styles.tabBtn} ${activeTabRight === "edit" ? styles.active : ""}`}
                onClick={() => setActiveTabRight("edit")}
              >
                <Edit3 size={12} style={{ display: "inline", marginRight: 4 }} />
                Edit
              </button>
            </div>
          </div>

          <div className={styles.editorArea}>
            {activeTabRight === "edit" ? (
              <textarea
                className={styles.textarea}
                value={aiLog}
                onChange={(e) => handleAiLogChange(e.target.value)}
                placeholder="AI records sprint retrospectives, pacing progress, and next iteration notes here..."
              />
            ) : (
              <div className={styles.previewArea}>
                {aiLog.trim() ? (
                  <MarkdownContent content={aiLog} />
                ) : (
                  <p className={styles.emptyHint}>No sprint notes yet. When you run weekly sprint planning with the Copilot, its assumptions will appear here.</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
