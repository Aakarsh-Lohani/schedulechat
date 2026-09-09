"use client";

import { useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { X, Plus, Calendar, CalendarClock } from "lucide-react";
import { useCreateTab, useDeleteTab, useTabs, useTasks } from "@/lib/api/hooks";
import { useUIStore } from "@/lib/store/uiStore";
import type { BoardView } from "@/lib/store/uiStore";
import styles from "./TabNav.module.scss";

function NavItem({ id, label, active, onClick, droppableId, showDelete, onDelete }: {
  id: string;
  label: React.ReactNode;
  active: boolean;
  onClick: () => void;
  droppableId?: string;
  showDelete?: boolean;
  onDelete?: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: droppableId ?? `nav:${id}`, disabled: !droppableId });
  return (
    <div className={styles.tabWrapper}>
      <button
        ref={droppableId ? setNodeRef : undefined}
        type="button"
        className={`${styles.tab} ${active ? styles.active : ""} ${isOver ? styles.dropTarget : ""}`}
        onClick={onClick}
      >
        {label}
      </button>
      {showDelete && (
        <button
          type="button"
          className={styles.deleteTabBtn}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onDelete?.();
          }}
          title="Delete tab"
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
}

export function TabNav({ view, onChangeView }: { view: BoardView; onChangeView: (v: BoardView) => void }) {
  const { data: tabs } = useTabs();
  const createTab = useCreateTab();
  const deleteTab = useDeleteTab();
  const { chatPanelOpen, toggleChatPanel } = useUIStore();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Fetch tasks only for the specific tab being deleted to check if empty
  const tabToDelete = tabs?.find((t) => t.id === confirmDeleteId);
  const { data: tabTasks, isLoading: isCheckingTasks } = useTasks(
    confirmDeleteId ? { tabId: confirmDeleteId } : {},
    `delete-check-${confirmDeleteId ?? "none"}`,
    { enabled: Boolean(confirmDeleteId) }
  );

  function submitNewTab() {
    if (name.trim()) createTab.mutate(name.trim());
    setName("");
    setAdding(false);
  }

  function handleDeleteTab(tabId: string) {
    setConfirmDeleteId(tabId);
  }

  function confirmDelete() {
    if (!confirmDeleteId) return;
    if (isCheckingTasks || !tabTasks || tabTasks.length > 0) {
      alert("Move or delete all tasks from this tab before deleting it.");
      return;
    }
    deleteTab.mutate(confirmDeleteId);
    if (view === confirmDeleteId) onChangeView("today");
    setConfirmDeleteId(null);
  }

  return (
    <nav className={styles.nav}>
      <NavItem id="today" label="Today's Tasks" active={view === "today"} onClick={() => onChangeView("today")} droppableId="today" />
      {tabs?.map((tab) => (
        <NavItem
          key={tab.id}
          id={tab.id}
          label={tab.name}
          active={view === tab.id}
          onClick={() => onChangeView(tab.id)}
          droppableId={`tab:${tab.id}`}
          showDelete={tab.name !== "Projects"}
          onDelete={() => handleDeleteTab(tab.id)}
        />
      ))}
      <NavItem
        id="calendar"
        label={
          <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
            <Calendar size={13} />
            Calendar
          </span>
        }
        active={view === "calendar"}
        onClick={() => onChangeView("calendar")}
      />
      <NavItem
        id="scheduled"
        label={
          <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
            <CalendarClock size={13} />
            Scheduled Tasks
          </span>
        }
        active={view === "scheduled"}
        onClick={() => onChangeView("scheduled")}
      />

      {adding ? (
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={submitNewTab}
          onKeyDown={(e) => e.key === "Enter" && submitNewTab()}
          placeholder="Tab name"
          style={{ width: 100 }}
        />
      ) : (
        <button type="button" className={styles.addBtn} title="Add tab" onClick={() => setAdding(true)}>
          <Plus size={14} />
        </button>
      )}

      <button
        type="button"
        className={`${styles.chatToggle} ${chatPanelOpen ? styles.active : ""}`}
        onClick={toggleChatPanel}
      >
        {chatPanelOpen ? "Hide copilot" : "Show copilot"}
      </button>

      {/* Confirm delete dialog */}
      {confirmDeleteId && (
        <div className={styles.confirmOverlay} onClick={() => setConfirmDeleteId(null)}>
          <div className={styles.confirmBox} onClick={(e) => e.stopPropagation()}>
            <p>Delete tab &quot;{tabToDelete?.name}&quot;?</p>
            {isCheckingTasks ? (
              <p className={styles.confirmWarn}>Checking tasks…</p>
            ) : tabTasks && tabTasks.length > 0 ? (
              <p className={styles.confirmWarn}>This tab has {tabTasks.length} task(s). Move or delete them first.</p>
            ) : null}
            <div className={styles.confirmActions}>
              <button type="button" onClick={() => setConfirmDeleteId(null)}>Cancel</button>
              <button
                type="button"
                className={styles.confirmDeleteBtn}
                onClick={confirmDelete}
                disabled={isCheckingTasks || !tabTasks || tabTasks.length > 0}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
