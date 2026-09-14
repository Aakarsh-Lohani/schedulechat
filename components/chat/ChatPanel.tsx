"use client";

import { useState } from "react";
import { Sparkles, Check, X, Plus, Trash2, CalendarClock, Pencil } from "lucide-react";
import { useUIStore } from "@/lib/store/uiStore";
import { MarkdownContent } from "./MarkdownContent";
import {
  useAiActions,
  useApproveAction,
  useChatHistory,
  useRejectAction,
  useSendChat,
  useUndoAction,
} from "@/lib/api/hooks";
import styles from "./ChatPanel.module.scss";

interface LocalMessage {
  role: "user" | "assistant";
  content: string;
}

const GEMINI_MODELS = [
  { id: "gemini-3.8-flash", label: "Gemini 3.8 Flash (Flagship)" },
  { id: "gemini-3.7-flash", label: "Gemini 3.7 Flash" },
  { id: "gemini-3.6-flash", label: "Gemini 3.6 Flash" },
  { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash" },
  { id: "gemini-3.1-pro", label: "Gemini 3.1 Pro" },
];

function getActionBadge(type: string) {
  switch (type) {
    case "create-task":
      return { label: "Create Task", icon: <Plus size={11} />, color: "#60a5fa" };
    case "update-task":
      return { label: "Update Task", icon: <Pencil size={11} />, color: "#f5a623" };
    case "delete-task":
      return { label: "Delete Task", icon: <Trash2 size={11} />, color: "#f0605a" };
    case "create-scheduled-task":
      return { label: "Schedule Series", icon: <CalendarClock size={11} />, color: "#a78bfa" };
    case "delete-scheduled-task":
      return { label: "Delete Series", icon: <Trash2 size={11} />, color: "#f0605a" };
    default:
      return { label: "Change", icon: <Sparkles size={11} />, color: "#a78bfa" };
  }
}

export function ChatPanel() {
  const { chatMode, setChatMode } = useUIStore();
  const { data: history } = useChatHistory();
  const [newMessages, setNewMessages] = useState<LocalMessage[]>([]);
  const [input, setInput] = useState("");
  const [selectedModel, setSelectedModel] = useState("gemini-3.8-flash");
  const sendChat = useSendChat();
  const { data: actions } = useAiActions();
  const approveAction = useApproveAction();
  const rejectAction = useRejectAction();
  const undoAction = useUndoAction();

  // Rendered history is the persisted thread plus whatever's been sent this session —
  // derived directly at render time rather than copied into state via an effect.
  const messages = [...(history ?? []), ...newMessages];

  async function handleSend() {
    const text = input.trim();
    if (!text || sendChat.isPending) return;
    setInput("");
    setNewMessages((m) => [...m, { role: "user", content: text }]);
    try {
      const result = await sendChat.mutateAsync({
        message: text,
        mode: chatMode,
        model: selectedModel,
      });
      setNewMessages((m) => [...m, { role: "assistant", content: result.reply }]);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Failed to communicate with Copilot";
      setInput(text);
      setNewMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: `Copilot request failed: ${errorMsg}. Your prompt has been restored. Please check your connection or AI provider key and try again.`,
        },
      ]);
    }
  }

  const proposed = (actions ?? []).filter((a) => a.status === "proposed");
  const recentHistory = (actions ?? []).filter((a) => a.status === "executed" || a.status === "undone").slice(0, 10);

  return (
    <div className={styles.chat}>
      <div className={styles.head}>
        <div className={styles.titleRow}>
          <div className={styles.title}>Copilot</div>
          <select
            className={styles.modelSelect}
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            title="Select Gemini Model"
          >
            {GEMINI_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.modeToggle}>
          <button
            type="button"
            className={`${styles.modeBtn} ${chatMode === "suggest" ? styles.active : ""}`}
            onClick={() => setChatMode("suggest")}
          >
            Suggest
          </button>
          <button
            type="button"
            className={`${styles.modeBtn} ${chatMode === "update" ? styles.active : ""}`}
            onClick={() => setChatMode("update")}
          >
            Update
          </button>
        </div>
      </div>

      <div className={styles.body}>
        {messages.map((m, i) => (
          <div key={i} className={`${styles.msg} ${m.role === "user" ? styles.user : styles.assistant}`}>
            {m.role === "assistant" && <div className={styles.role}>Copilot</div>}
            {m.role === "assistant" ? <MarkdownContent content={m.content} /> : m.content}
          </div>
        ))}

        {proposed.map((action) => {
          const badge = getActionBadge(action.type);
          return (
            <div key={action.id} className={styles.approvalCard}>
              <div className={styles.approvalHead}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <Sparkles size={12} />
                  <span>Confirmation Required</span>
                </div>
                <span
                  className={styles.typeBadge}
                  style={{
                    backgroundColor: `${badge.color}20`,
                    color: badge.color,
                    borderColor: `${badge.color}40`,
                  }}
                >
                  {badge.icon}
                  {badge.label}
                </span>
              </div>
              <div className={styles.approvalSummary}>{action.summary}</div>
              <div className={styles.approvalActions}>
                <button
                  type="button"
                  className={`${styles.btn} ${styles.approve}`}
                  disabled={approveAction.isPending}
                  onClick={() => approveAction.mutate(action.id)}
                >
                  <Check size={12} style={{ display: "inline-block", verticalAlign: "middle", marginRight: 4 }} />
                  Approve
                </button>
                <button
                  type="button"
                  className={`${styles.btn} ${styles.reject}`}
                  disabled={rejectAction.isPending}
                  onClick={() => rejectAction.mutate(action.id)}
                >
                  <X size={12} style={{ display: "inline-block", verticalAlign: "middle", marginRight: 4 }} />
                  Reject
                </button>
              </div>
            </div>
          );
        })}

        {sendChat.isPending && <div className={`${styles.msg} ${styles.assistant}`}>Thinking…</div>}
      </div>

      <div className={styles.undoList}>
        <div className={styles.undoHeading}>Recent AI changes</div>
        {recentHistory.length === 0 && <div className={styles.undoDesc}>No changes yet</div>}
        {recentHistory.map((a) => (
          <div key={a.id} className={styles.undoItem}>
            <span className={styles.undoDesc}>{a.summary}</span>
            <button
              type="button"
              className={styles.undoBtn}
              disabled={a.status === "undone" || undoAction.isPending}
              onClick={() => undoAction.mutate(a.id)}
            >
              {a.status === "undone" ? "Undone" : "Undo"}
            </button>
          </div>
        ))}
      </div>

      <div className={styles.inputWrap}>
        <div className={styles.inputRow}>
          <input
            className={styles.textInput}
            placeholder="Ask Copilot or approve a change…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
          />
          <button type="button" className={styles.send} disabled={sendChat.isPending} onClick={handleSend}>
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
