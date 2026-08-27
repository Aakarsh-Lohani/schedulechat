"use client";

import { useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { useCreateTab, useTabs } from "@/lib/api/hooks";
import { useUIStore } from "@/lib/store/uiStore";
import type { BoardView } from "@/lib/store/uiStore";
import styles from "./TabNav.module.scss";

function NavItem({ id, label, active, onClick, droppableId }: {
  id: string;
  label: string;
  active: boolean;
  onClick: () => void;
  droppableId?: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: droppableId ?? `nav:${id}`, disabled: !droppableId });
  return (
    <button
      ref={droppableId ? setNodeRef : undefined}
      type="button"
      className={`${styles.tab} ${active ? styles.active : ""} ${isOver ? styles.dropTarget : ""}`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

export function TabNav({ view, onChangeView }: { view: BoardView; onChangeView: (v: BoardView) => void }) {
  const { data: tabs } = useTabs();
  const createTab = useCreateTab();
  const { chatPanelOpen, toggleChatPanel } = useUIStore();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

  function submitNewTab() {
    if (name.trim()) createTab.mutate(name.trim());
    setName("");
    setAdding(false);
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
        />
      ))}
      <NavItem id="calendar" label="🗓 Calendar" active={view === "calendar"} onClick={() => onChangeView("calendar")} />

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
          +
        </button>
      )}

      <button
        type="button"
        className={`${styles.chatToggle} ${chatPanelOpen ? styles.active : ""}`}
        onClick={toggleChatPanel}
      >
        {chatPanelOpen ? "Hide copilot" : "Show copilot"}
      </button>
    </nav>
  );
}
