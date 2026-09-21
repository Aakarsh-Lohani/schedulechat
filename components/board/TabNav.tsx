"use client";

import { useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { X, Plus, Calendar, CalendarClock, LayoutDashboard, GripVertical, Target } from "lucide-react";
import { useCreateTab, useDeleteTab, useUpdateTab, useTabs, useTasks } from "@/lib/api/hooks";
import { useUIStore } from "@/lib/store/uiStore";
import type { BoardView } from "@/lib/store/uiStore";
import styles from "./TabNav.module.scss";

function NavItem({
  id,
  label,
  active,
  onClick,
  droppableId,
  showDelete,
  onDelete,
  draggable,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  isDragging,
  isDragOver,
}: {
  id: string;
  label: React.ReactNode;
  active: boolean;
  onClick: () => void;
  droppableId?: string;
  showDelete?: boolean;
  onDelete?: () => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: () => void;
  onDrop?: (e: React.DragEvent) => void;
  isDragging?: boolean;
  isDragOver?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: droppableId ?? `nav:${id}`, disabled: !droppableId });
  return (
    <div
      className={`${styles.tabWrapper} ${isDragging ? styles.isDragging : ""} ${isDragOver ? styles.dragOver : ""}`}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
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
  const updateTab = useUpdateTab();
  const deleteTab = useDeleteTab();
  const { chatPanelOpen, toggleChatPanel } = useUIStore();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null);
  const [dragOverTabId, setDragOverTabId] = useState<string | null>(null);

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
    deleteTab.mutate(confirmDeleteId);
    if (view === confirmDeleteId) onChangeView("today");
    setConfirmDeleteId(null);
  }

  function handleTabDrop(targetTabId: string) {
    if (!draggedTabId || draggedTabId === targetTabId || !tabs) {
      setDraggedTabId(null);
      setDragOverTabId(null);
      return;
    }
    const draggedTab = tabs.find((t) => t.id === draggedTabId);
    const targetTab = tabs.find((t) => t.id === targetTabId);
    if (!draggedTab || !targetTab) {
      setDraggedTabId(null);
      setDragOverTabId(null);
      return;
    }

    // Swap orders
    updateTab.mutate({ id: draggedTab.id, order: targetTab.order });
    updateTab.mutate({ id: targetTab.id, order: draggedTab.order });
    setDraggedTabId(null);
    setDragOverTabId(null);
  }

  return (
    <nav className={styles.nav}>
      <NavItem
        id="dashboard"
        label={
          <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
            <LayoutDashboard size={13} />
            Dashboard
          </span>
        }
        active={view === "dashboard"}
        onClick={() => onChangeView("dashboard")}
      />
      <NavItem id="today" label="Today's Tasks" active={view === "today"} onClick={() => onChangeView("today")} droppableId="today" />
      <NavItem
        id="goals"
        label={
          <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
            <Target size={13} />
            Goals & Limits
          </span>
        }
        active={view === "goals"}
        onClick={() => onChangeView("goals")}
      />
      {tabs?.map((tab) => {
        const isPrimary = tab.name === "Projects" || tab.isSystemDefault;
        return (
          <NavItem
            key={tab.id}
            id={tab.id}
            label={
              <>
                <GripVertical size={11} style={{ opacity: 0.4, cursor: "grab" }} />
                <span>{tab.name}</span>
                {isPrimary && <span className={styles.primaryBadge}>Primary</span>}
              </>
            }
            active={view === tab.id}
            onClick={() => onChangeView(tab.id)}
            droppableId={`tab:${tab.id}`}
            showDelete={true}
            onDelete={() => handleDeleteTab(tab.id)}
            draggable={true}
            onDragStart={(e) => {
              e.dataTransfer.setData("text/tab-id", tab.id);
              setDraggedTabId(tab.id);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              if (draggedTabId && draggedTabId !== tab.id) {
                setDragOverTabId(tab.id);
              }
            }}
            onDragLeave={() => {
              if (dragOverTabId === tab.id) setDragOverTabId(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              handleTabDrop(tab.id);
            }}
            isDragging={draggedTabId === tab.id}
            isDragOver={dragOverTabId === tab.id}
          />
        );
      })}
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
                disabled={isCheckingTasks}
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
