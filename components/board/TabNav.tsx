"use client";

import { useState, useEffect } from "react";
import { useDroppable } from "@dnd-kit/core";
import { X, Plus, Calendar, CalendarClock, LayoutDashboard, GripVertical, Target } from "lucide-react";
import { useCreateTab, useDeleteTab, useUpdateTab, useTabs, useTasks } from "@/lib/api/hooks";
import { useUIStore } from "@/lib/store/uiStore";
import type { BoardView } from "@/lib/store/uiStore";
import styles from "./TabNav.module.scss";

const NAV_STORAGE_KEY = "schedulechat_tabnav_order_v3";

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

  // Default reorderable item IDs (pinned dashboard is handled separately)
  const defaultReorderableIds = [
    "today",
    "goals",
    ...(tabs?.map((t) => t.id) ?? []),
    "calendar",
    "scheduled",
  ];

  const [navOrder, setNavOrder] = useState<string[]>([]);

  // Sync navOrder with localStorage and current tabs list
  useEffect(() => {
    try {
      const saved = localStorage.getItem(NAV_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as string[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          const validSet = new Set(defaultReorderableIds);
          const filtered = parsed.filter((id) => validSet.has(id));
          const missing = defaultReorderableIds.filter((id) => !filtered.includes(id));
          setNavOrder([...filtered, ...missing]);
          return;
        }
      }
    } catch {
      // ignore JSON storage parse error
    }
    setNavOrder(defaultReorderableIds);
  }, [tabs]);

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

  function handleNavDrop(targetId: string) {
    if (!draggedTabId || draggedTabId === targetId) {
      setDraggedTabId(null);
      setDragOverTabId(null);
      return;
    }

    const currentOrder = navOrder.length > 0 ? [...navOrder] : [...defaultReorderableIds];
    const fromIndex = currentOrder.indexOf(draggedTabId);
    const toIndex = currentOrder.indexOf(targetId);

    if (fromIndex !== -1 && toIndex !== -1) {
      currentOrder.splice(fromIndex, 1);
      currentOrder.splice(toIndex, 0, draggedTabId);
      setNavOrder(currentOrder);
      try {
        localStorage.setItem(NAV_STORAGE_KEY, JSON.stringify(currentOrder));
      } catch {
        // ignore storage quota error
      }
    }

    // If both are custom tabs in MongoDB, sync their order in the database
    if (tabs) {
      const draggedTab = tabs.find((t) => t.id === draggedTabId);
      const targetTab = tabs.find((t) => t.id === targetId);
      if (draggedTab && targetTab) {
        updateTab.mutate({ id: draggedTab.id, order: targetTab.order });
        updateTab.mutate({ id: targetTab.id, order: draggedTab.order });
      }
    }

    setDraggedTabId(null);
    setDragOverTabId(null);
  }

  const itemsToRender = navOrder.length > 0 ? navOrder : defaultReorderableIds;

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

      {itemsToRender.map((id) => {
        if (id === "today") {
          return (
            <NavItem
              key="today"
              id="today"
              label="Today's Tasks"
              active={view === "today"}
              onClick={() => onChangeView("today")}
              droppableId="today"
              draggable={true}
              onDragStart={(e) => {
                e.dataTransfer.setData("text/tab-id", "today");
                setDraggedTabId("today");
              }}
              onDragOver={(e) => {
                e.preventDefault();
                if (draggedTabId && draggedTabId !== "today") setDragOverTabId("today");
              }}
              onDragLeave={() => {
                if (dragOverTabId === "today") setDragOverTabId(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                handleNavDrop("today");
              }}
              isDragging={draggedTabId === "today"}
              isDragOver={dragOverTabId === "today"}
            />
          );
        }

        if (id === "goals") {
          return (
            <NavItem
              key="goals"
              id="goals"
              label={
                <>
                  <GripVertical size={11} style={{ opacity: 0.4, cursor: "grab" }} />
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                    <Target size={13} />
                    Goals
                  </span>
                </>
              }
              active={view === "goals"}
              onClick={() => onChangeView("goals")}
              draggable={true}
              onDragStart={(e) => {
                e.dataTransfer.setData("text/tab-id", "goals");
                setDraggedTabId("goals");
              }}
              onDragOver={(e) => {
                e.preventDefault();
                if (draggedTabId && draggedTabId !== "goals") setDragOverTabId("goals");
              }}
              onDragLeave={() => {
                if (dragOverTabId === "goals") setDragOverTabId(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                handleNavDrop("goals");
              }}
              isDragging={draggedTabId === "goals"}
              isDragOver={dragOverTabId === "goals"}
            />
          );
        }

        if (id === "calendar") {
          return (
            <NavItem
              key="calendar"
              id="calendar"
              label={
                <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                  <Calendar size={13} />
                  Calendar
                </span>
              }
              active={view === "calendar"}
              onClick={() => onChangeView("calendar")}
              draggable={true}
              onDragStart={(e) => {
                e.dataTransfer.setData("text/tab-id", "calendar");
                setDraggedTabId("calendar");
              }}
              onDragOver={(e) => {
                e.preventDefault();
                if (draggedTabId && draggedTabId !== "calendar") setDragOverTabId("calendar");
              }}
              onDragLeave={() => {
                if (dragOverTabId === "calendar") setDragOverTabId(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                handleNavDrop("calendar");
              }}
              isDragging={draggedTabId === "calendar"}
              isDragOver={dragOverTabId === "calendar"}
            />
          );
        }

        if (id === "scheduled") {
          return (
            <NavItem
              key="scheduled"
              id="scheduled"
              label={
                <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                  <CalendarClock size={13} />
                  Scheduled Tasks
                </span>
              }
              active={view === "scheduled"}
              onClick={() => onChangeView("scheduled")}
              draggable={true}
              onDragStart={(e) => {
                e.dataTransfer.setData("text/tab-id", "scheduled");
                setDraggedTabId("scheduled");
              }}
              onDragOver={(e) => {
                e.preventDefault();
                if (draggedTabId && draggedTabId !== "scheduled") setDragOverTabId("scheduled");
              }}
              onDragLeave={() => {
                if (dragOverTabId === "scheduled") setDragOverTabId(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                handleNavDrop("scheduled");
              }}
              isDragging={draggedTabId === "scheduled"}
              isDragOver={dragOverTabId === "scheduled"}
            />
          );
        }

        const tab = tabs?.find((t) => t.id === id);
        if (!tab) return null;

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
              handleNavDrop(tab.id);
            }}
            isDragging={draggedTabId === tab.id}
            isDragOver={dragOverTabId === tab.id}
          />
        );
      })}

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
