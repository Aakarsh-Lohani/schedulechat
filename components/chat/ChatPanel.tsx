"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { useUIStore } from "@/lib/store/uiStore";
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
            {m.content}
          </div>
        ))}

        {proposed.map((action) => (
          <div key={action.id} className={styles.approvalCard}>
            <div className={styles.approvalHead}>
              <Sparkles size={13} />
              Proposed change
            </div>
            <div className={styles.approvalSummary}>{action.summary}</div>
            <div className={styles.approvalActions}>
              <button
                type="button"
                className={`${styles.btn} ${styles.approve}`}
                disabled={approveAction.isPending}
                onClick={() => approveAction.mutate(action.id)}
              >
                Approve
              </button>
              <button
                type="button"
                className={`${styles.btn} ${styles.reject}`}
                disabled={rejectAction.isPending}
                onClick={() => rejectAction.mutate(action.id)}
              >
                Reject
              </button>
            </div>
          </div>
        ))}

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
