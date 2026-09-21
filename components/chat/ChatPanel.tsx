"use client";

import { useEffect, useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Sparkles,
  Check,
  X,
  Plus,
  Trash2,
  CalendarClock,
  Pencil,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  Zap,
} from "lucide-react";
import { useUIStore } from "@/lib/store/uiStore";
import { MarkdownContent } from "./MarkdownContent";
import {
  useAiActions,
  useApproveAction,
  useChatHistory,
  useConversations,
  useCreateConversation,
  useDeleteConversation,
  useUpdateConversationTitle,
  useRejectAction,
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
    case "create-tasks-batch":
      return { label: "Sprint Batch", icon: <Plus size={11} />, color: "#10b981" };
    case "update-sprint-log":
      return { label: "Sprint Log", icon: <Sparkles size={11} />, color: "#a78bfa" };
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
  const qc = useQueryClient();
  const { chatMode, setChatMode, copilotWidth, setCopilotWidth } = useUIStore();
  const { data: conversations } = useConversations();
  const createConvo = useCreateConversation();
  const deleteConvo = useDeleteConversation();
  const updateConvoTitle = useUpdateConversationTitle();

  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitleValue, setEditTitleValue] = useState("");

  // Sync active conversation when conversations load or when none is selected
  useEffect(() => {
    if (conversations && conversations.length > 0 && !activeConversationId) {
      setActiveConversationId(conversations[0]?.id ?? null);
    }
  }, [conversations, activeConversationId]);

  const { data: history } = useChatHistory(activeConversationId);
  const [newMessages, setNewMessages] = useState<LocalMessage[]>([]);
  const [input, setInput] = useState("");
  const [selectedModel, setSelectedModel] = useState("gemini-3.8-flash");
  const [isResizing, setIsResizing] = useState(false);

  // Live thinking & streaming progress state
  const [isGenerating, setIsGenerating] = useState(false);
  const [liveStatus, setLiveStatus] = useState<string | null>(null);
  const [liveThinking, setLiveThinking] = useState<string>("");
  const [showThinking, setShowThinking] = useState(true);

  // Special commands popover state
  const [showCmdMenu, setShowCmdMenu] = useState(false);
  const specialCmdRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (specialCmdRef.current && !specialCmdRef.current.contains(e.target as Node)) {
        setShowCmdMenu(false);
      }
    }
    if (showCmdMenu) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showCmdMenu]);

  const { data: actions } = useAiActions();
  const approveAction = useApproveAction();
  const rejectAction = useRejectAction();
  const undoAction = useUndoAction();

  // Derived messages for current conversation thread
  const messages = [...(history ?? []), ...newMessages];

  // Drag resizing for Copilot width
  function handleStartResize(e: React.MouseEvent) {
    e.preventDefault();
    setIsResizing(true);
    const onMouseMove = (moveEvent: MouseEvent) => {
      const newWidth = window.innerWidth - moveEvent.clientX;
      setCopilotWidth(newWidth);
    };
    const onMouseUp = () => {
      setIsResizing(false);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

  async function handleNewChat() {
    try {
      const res = await createConvo.mutateAsync("New Chat");
      setActiveConversationId(res.conversation.id);
      setNewMessages([]);
    } catch {
      // handled globally
    }
  }

  async function handleDeleteConvo(id: string) {
    if (confirm("Delete this conversation?")) {
      await deleteConvo.mutateAsync(id);
      setActiveConversationId(null);
      setNewMessages([]);
    }
  }

  const activeConvo = conversations?.find((c) => c.id === activeConversationId);

  function startEditingTitle() {
    if (!activeConvo) return;
    setEditTitleValue(activeConvo.title);
    setIsEditingTitle(true);
  }

  async function handleSaveTitle() {
    if (!activeConversationId || !editTitleValue.trim()) {
      setIsEditingTitle(false);
      return;
    }
    await updateConvoTitle.mutateAsync({ id: activeConversationId, title: editTitleValue.trim() });
    setIsEditingTitle(false);
  }

  async function handleSend(customText?: string) {
    const text = (customText ?? input).trim();
    if (!text || isGenerating) return;
    if (!customText) setInput("");
    setNewMessages((m) => [...m, { role: "user", content: text }]);
    setIsGenerating(true);
    setLiveStatus("Starting Copilot reasoning...");
    setLiveThinking("");
    setShowThinking(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          mode: chatMode,
          model: selectedModel,
          conversationId: activeConversationId,
          stream: true,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      if (!response.body) {
        throw new Error("No response stream available");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalReply = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === "status") {
              setLiveStatus(data.text);
            } else if (data.type === "thinking") {
              setLiveThinking((prev) => prev + (prev ? "\n" : "") + data.text);
            } else if (data.type === "done") {
              finalReply = data.reply;
              if (data.conversationId && data.conversationId !== activeConversationId) {
                setActiveConversationId(data.conversationId);
              }
              qc.invalidateQueries({ queryKey: ["ai-actions"] });
              qc.invalidateQueries({ queryKey: ["conversations"] });
              qc.invalidateQueries({ queryKey: ["goal-context"] });
            } else if (data.type === "error") {
              throw new Error(data.error);
            }
          } catch {
            // Ignore partial parse errors
          }
        }
      }

      if (finalReply) {
        setNewMessages((m) => [...m, { role: "assistant", content: finalReply }]);
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Failed to communicate with Copilot";
      if (!customText) setInput(text);
      setNewMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: `Copilot request failed: ${errorMsg}. Your prompt has been restored. Please try again.`,
        },
      ]);
    } finally {
      setIsGenerating(false);
      setLiveStatus(null);
    }
  }

  const SPRINT_PROMPT =
    "Review my Goals and any unfinished tasks from the past 7 days. Plan the next 7-day sprint: allocate tasks within my daily limits (max 8h weekdays, max 10h weekends), propose a batch of 5-8 focused tasks with specific scheduled dates across the upcoming 7 days, explain your assumptions, and propose updating the AI Sprint Log.";

  function handleTriggerSprint() {
    handleSend(SPRINT_PROMPT);
  }

  const proposed = (actions ?? []).filter((a) => a.status === "proposed");
  const recentHistory = (actions ?? []).filter((a) => a.status === "executed" || a.status === "undone").slice(0, 10);

  return (
    <div className={styles.chat} style={{ width: copilotWidth }}>
      <div
        className={`${styles.resizeHandle} ${isResizing ? styles.resizing : ""}`}
        onMouseDown={handleStartResize}
        title="Drag to resize Copilot"
      />

      <div className={styles.head}>
        <div className={styles.convoRow}>
          {isEditingTitle ? (
            <div className={styles.titleEditRow}>
              <input
                type="text"
                className={styles.titleEditInput}
                value={editTitleValue}
                onChange={(e) => setEditTitleValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveTitle();
                  if (e.key === "Escape") setIsEditingTitle(false);
                }}
                autoFocus
              />
              <button type="button" className={styles.iconBtn} onClick={handleSaveTitle} title="Save title">
                <Check size={12} />
              </button>
              <button type="button" className={styles.iconBtn} onClick={() => setIsEditingTitle(false)} title="Cancel">
                <X size={12} />
              </button>
            </div>
          ) : (
            <>
              <div className={styles.convoSelector}>
                <MessageSquare size={13} className={styles.convoIcon} />
                <select
                  className={styles.convoSelect}
                  value={activeConversationId ?? ""}
                  onChange={(e) => {
                    setActiveConversationId(e.target.value || null);
                    setNewMessages([]);
                  }}
                  title="Select conversation"
                >
                  {conversations && conversations.length > 0 ? (
                    conversations.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title}
                      </option>
                    ))
                  ) : (
                    <option value="">Current Thread</option>
                  )}
                </select>
              </div>

              {activeConversationId && (
                <button
                  type="button"
                  className={styles.editChatBtn}
                  onClick={startEditingTitle}
                  title="Rename conversation"
                >
                  <Pencil size={13} />
                </button>
              )}

              <button
                type="button"
                className={styles.newChatBtn}
                onClick={handleNewChat}
                disabled={createConvo.isPending}
                title="Start a new conversation"
              >
                <Plus size={13} />
                <span>New</span>
              </button>

              {activeConversationId && (
                <button
                  type="button"
                  className={styles.deleteChatBtn}
                  onClick={() => handleDeleteConvo(activeConversationId)}
                  disabled={deleteConvo.isPending}
                  title="Delete conversation"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </>
          )}
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
          const rawPayload = action.proposedPayload as Record<string, unknown> | undefined;
          const batchTasks =
            action.type === "create-tasks-batch" && Array.isArray(rawPayload?.tasks)
              ? (rawPayload.tasks as Array<{ title: string; scheduledDate?: string; estimateMinutes?: number }>)
              : null;

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

              {batchTasks && batchTasks.length > 0 && (
                <div className={styles.batchTasksList}>
                  {batchTasks.map((bt, idx) => (
                    <div key={idx} className={styles.batchTaskItem}>
                      <span>{bt.title}</span>
                      <span className={styles.batchTaskDate}>
                        {bt.scheduledDate ? bt.scheduledDate.slice(0, 10) : "Today"} ({bt.estimateMinutes ?? 60}m)
                      </span>
                    </div>
                  ))}
                </div>
              )}

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

        {isGenerating && (
          <div className={styles.thinkingBox}>
            <div className={styles.thinkingHeader} onClick={() => setShowThinking((v) => !v)}>
              <div className={styles.thinkingTitle}>
                <Sparkles size={13} className={styles.thinkingSpinner} />
                <span>{liveStatus || "Thinking & Planning..."}</span>
              </div>
              {showThinking ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </div>
            {showThinking && liveThinking && <div className={styles.thinkingContent}>{liveThinking}</div>}
          </div>
        )}
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
        {/* Suggest / Update toggle, Special commands icon popover, and Model select */}
        <div className={styles.inputControlsRow}>
          <div className={styles.controlsLeft}>
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

            <div className={styles.specialCmdWrap} ref={specialCmdRef}>
              <button
                type="button"
                className={`${styles.specialCmdBtn} ${showCmdMenu ? styles.active : ""}`}
                onClick={() => setShowCmdMenu((v) => !v)}
                title="Special commands"
                aria-label="Special commands"
              >
                <Zap size={13} />
              </button>
              {showCmdMenu && (
                <div className={styles.specialCmdMenu}>
                  <div className={styles.specialCmdMenuHead}>Special Commands</div>
                  <button
                    type="button"
                    className={styles.specialCmdItem}
                    onClick={() => {
                      setShowCmdMenu(false);
                      handleTriggerSprint();
                    }}
                    disabled={isGenerating}
                  >
                    <div className={styles.cmdItemTitle}>
                      <CalendarClock size={13} color="#a78bfa" />
                      <span>🚀 Plan Next 7-Day Sprint</span>
                    </div>
                    <div className={styles.cmdItemDesc}>
                      Review Goals & study limits, check unfinished tasks, and plan next 7 days.
                    </div>
                  </button>
                </div>
              )}
            </div>
          </div>

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

        <div className={styles.inputRow}>
          <input
            className={styles.textInput}
            placeholder="Ask Copilot or request changes…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
          />
          <button type="button" className={styles.send} disabled={isGenerating} onClick={() => handleSend()}>
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
