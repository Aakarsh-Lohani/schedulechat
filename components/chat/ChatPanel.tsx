"use client";

import { useEffect, useState, useRef, useMemo } from "react";
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
  Square,
  Wrench,
  AlertCircle,
  Clock,
  History,
} from "lucide-react";
import { useUIStore } from "@/lib/store/uiStore";
import { MarkdownContent } from "./MarkdownContent";
import type { TraceStep } from "@/lib/ai/providers/types";
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
  useModels,
} from "@/lib/api/hooks";
import styles from "./ChatPanel.module.scss";

interface LocalMessage {
  role: "user" | "assistant";
  content: string;
  thinkingContent?: string;
  traceSteps?: TraceStep[];
  error?: string;
  isStopped?: boolean;
}

/** Individual collapsible thought step with Markdown support, open by default but collapsible by user. */
function ThoughtStepAccordion({
  title,
  content,
}: {
  title?: string;
  content: string;
}) {
  const [open, setOpen] = useState(true);

  // Derive a smart title from the first heading or bold title in the thought content
  const derivedTitle = useMemo(() => {
    if (title && title !== "Reasoning" && title.trim()) return title.trim();
    const lines = content.trim().split("\n");
    for (const l of lines) {
      const clean = l.replace(/^[#*\s-]+/, "").replace(/[*_`]/g, "").trim();
      if (clean && clean.length > 2) {
        return clean.length > 55 ? clean.slice(0, 55) + "…" : clean;
      }
    }
    return "Reasoning";
  }, [title, content]);

  return (
    <div className={styles.thoughtAccordionItem}>
      <div className={styles.thoughtAccordionHeader} onClick={() => setOpen((v) => !v)}>
        <div className={styles.thoughtAccordionTitle}>
          <Sparkles size={11} className={styles.thoughtIcon} />
          <span>{derivedTitle}</span>
        </div>
        <div className={styles.thoughtAccordionChevron}>
          {open ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
        </div>
      </div>
      {open && (
        <div className={styles.thoughtAccordionBody}>
          <MarkdownContent content={content} allowMermaid={false} />
        </div>
      )}
    </div>
  );
}

/** Live counter showing elapsed seconds since a given start time. */
function StepTimer({ startTime }: { startTime: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const secs = Math.floor((now - startTime) / 1000);
  return <span className={styles.stepTimer}>{secs}s</span>;
}

/** Collapsible thinking accordion, used live during generation and permanently on completed messages. */
function ThinkingAccordion({
  content,
  steps,
  status,
  isLive,
}: {
  content?: string;
  steps?: TraceStep[];
  status?: string | null;
  isLive: boolean;
}) {
  const [expanded, setExpanded] = useState(isLive);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!isLive) return;
    setElapsed(0);
    const id = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [isLive]);

  const stepCount = steps?.length ?? 0;
  const toolCount = steps?.filter((s) => s.kind === "tool").length ?? 0;

  const timerSuffix = isLive && elapsed > 0 ? ` ${elapsed}s` : "";
  const liveLabel = (status || "Thinking & Planning...") + timerSuffix;
  const completedLabel =
    toolCount > 0
      ? `Thought process (${toolCount} tool call${toolCount > 1 ? "s" : ""}, ${stepCount} step${stepCount > 1 ? "s" : ""})`
      : `Thought process (${stepCount} step${stepCount > 1 ? "s" : ""})`;

  return (
    <div className={`${styles.thinkingBox} ${!isLive ? styles.thinkingBoxCompleted : ""}`}>
      <div className={styles.thinkingHeader} onClick={() => setExpanded((v) => !v)}>
        <div className={styles.thinkingTitle}>
          {isLive ? (
            <Sparkles size={13} className={styles.thinkingSpinner} />
          ) : (
            <Sparkles size={13} />
          )}
          <span>{isLive ? liveLabel : completedLabel}</span>
        </div>
        <div className={styles.thinkingHeaderRight}>
          {isLive && status && <span className={styles.livePulseBadge}>Live</span>}
          {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </div>
      </div>

      {expanded && (
        <div className={styles.thinkingContent}>
          {steps && steps.length > 0 ? (
            <div className={styles.traceTimeline}>
              {steps.map((step) => {
                if (step.kind === "tool") {
                  return (
                    <div key={step.id} className={styles.traceToolItem}>
                      <div className={styles.traceToolHead}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <Wrench size={11} className={styles.toolIcon} />
                          <span className={styles.traceToolName}>{step.toolName || step.title}</span>
                        </div>
                        {step.status === "running" ? (
                          <span className={styles.traceBadgeRunning}>
                            <Sparkles size={9} className={styles.thinkingSpinner} /> running
                            <StepTimer startTime={step.timestamp} />
                          </span>
                        ) : step.isError ? (
                          <span className={styles.traceBadgeError}>error</span>
                        ) : (
                          <span className={styles.traceBadgeDone}>
                            <Check size={10} /> completed
                            {step.durationSecs != null && (
                              <span className={styles.stepTimerDone}>{step.durationSecs}s</span>
                            )}
                          </span>
                        )}
                      </div>
                      {step.toolResult && (
                        <div className={styles.traceToolResult}>{step.toolResult}</div>
                      )}
                    </div>
                  );
                }

                if (step.kind === "thought") {
                  return (
                    <ThoughtStepAccordion
                      key={step.id}
                      title={step.title}
                      content={step.detail || step.title}
                    />
                  );
                }

                return (
                  <div key={step.id} className={styles.traceStatusItem}>
                    <Clock size={10} className={styles.statusIcon} />
                    <span>{step.title}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            content && <ThoughtStepAccordion content={content} />
          )}
        </div>
      )}
    </div>
  );
}

interface ParsedErrorInfo {
  title: string;
  tableData: Array<{ key: string; value: React.ReactNode }>;
  raw: string;
}

function parseError(rawError: string): ParsedErrorInfo {
  const clean = rawError.replace(/^Copilot error:\s*/i, "").trim();

  // 1. Determine concise title
  let title = "Copilot Error";
  const is429 = /429|quota exceeded|too many requests|rate limit/i.test(clean);
  const isAuth = /401|403|unauthorized|api key|forbidden/i.test(clean);
  const isTimeout = /504|timeout|timed out|took longer/i.test(clean);
  const isServer = /500|502|503|internal server error|bad gateway/i.test(clean);

  if (is429) title = "Rate Limit / Quota Exceeded (429)";
  else if (isAuth) title = "Authentication / API Key Error";
  else if (isTimeout) title = "Gateway Timeout (504)";
  else if (isServer) title = "AI Provider Service Error";
  else {
    const firstLine = clean.split("\n")[0] ?? "";
    title = firstLine.length > 50 ? firstLine.slice(0, 50) + "…" : firstLine || "Copilot Error";
  }

  // 2. Extract structured fields for table
  const rows: Array<{ key: string; value: React.ReactNode }> = [];

  // Model
  const modelMatch = clean.match(/model[:\s/]+([a-zA-Z0-9_.-]+)/i);
  if (modelMatch?.[1]) {
    rows.push({ key: "Model", value: modelMatch[1] });
  }

  // Status / Code
  const statusMatch = clean.match(/\[(4\d\d|5\d\d)\s*([^\]]*)\]/i);
  if (statusMatch) {
    rows.push({ key: "Status", value: `${statusMatch[1]} ${statusMatch[2]}`.trim() });
  }

  // Retry Delay
  const retryMatch = clean.match(/retry(?:Delay|\s+in)[:\s"]*([0-9.]+[a-z]?)/i);
  if (retryMatch?.[1]) {
    rows.push({ key: "Retry After", value: retryMatch[1] });
  }

  // Quota Metric / Limit
  const limitMatch = clean.match(/limit:\s*(\d+)/i);
  const quotaMatch = clean.match(/quotaMetric["']?\s*:\s*["']([^"']+)["']/i) || clean.match(/metric:\s*([a-zA-Z0-9_./-]+)/i);
  const quotaName = quotaMatch?.[1] ? quotaMatch[1].split("/").pop() : undefined;
  const limitCount = limitMatch?.[1];
  if (quotaName || limitCount) {
    rows.push({
      key: "Quota",
      value: `${limitCount ? `Limit: ${limitCount} requests` : "Exceeded"}${quotaName ? ` (${quotaName})` : ""}`,
    });
  }

  // Extract JSON payload if present
  const jsonMatch = clean.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
  const jsonStr = jsonMatch?.[1];
  if (jsonStr) {
    try {
      const parsed = JSON.parse(jsonStr);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item["@type"]?.includes("QuotaFailure") && Array.isArray(item.violations)) {
            const v = item.violations[0];
            if (v?.quotaId && !rows.some((r) => r.key === "Quota ID")) {
              rows.push({ key: "Quota ID", value: String(v.quotaId) });
            }
          }
        }
      } else if (typeof parsed === "object" && parsed !== null) {
        if (parsed.error && typeof parsed.error === "object") {
          const e = parsed.error as Record<string, unknown>;
          if (e.message && !rows.some((r) => r.key === "Message")) {
            rows.push({ key: "Message", value: String(e.message) });
          }
          if (e.type && !rows.some((r) => r.key === "Error Type")) {
            rows.push({ key: "Error Type", value: String(e.type) });
          }
        }
      }
    } catch {
      // ignore parse failure
    }
  }

  // Reference Links
  const linkMatches = Array.from(new Set(clean.match(/https?:\/\/[^\s"',\]}]+/g) || []));
  if (linkMatches.length > 0) {
    rows.push({
      key: "Links",
      value: (
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {linkMatches.slice(0, 3).map((url, i) => (
            <a
              key={i}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "#a78bfa", textDecoration: "underline", wordBreak: "break-all" }}
            >
              {url.replace(/^https?:\/\//, "")}
            </a>
          ))}
        </div>
      ),
    });
  }

  // General detail if not covered
  if (!rows.some((r) => r.key === "Message")) {
    const summaryMsg = clean
      .replace(/\[GoogleGenerativeAI Error\]:?/gi, "")
      .replace(/Error fetching from https?:\/\/[^\s:]+:?/gi, "")
      .replace(/\[\d+[^\]]*\]/g, "")
      .replace(/https?:\/\/[^\s]+/g, "")
      .replace(/\[[\s\S]*\]$/g, "")
      .trim();
    if (summaryMsg && summaryMsg.length > 5) {
      const displayMsg = summaryMsg.length > 220 ? summaryMsg.slice(0, 220) + "…" : summaryMsg;
      rows.unshift({ key: "Details", value: displayMsg });
    }
  }

  return { title, tableData: rows, raw: clean };
}

/** Expandable Error Accordion with structured key-value table and overflow protection */
function ErrorAccordion({ error }: { error: string }) {
  const [open, setOpen] = useState(false);
  const parsed = useMemo(() => parseError(error), [error]);

  return (
    <div className={styles.errorAccordion}>
      <div className={styles.errorAccordionHeader} onClick={() => setOpen((v) => !v)}>
        <div className={styles.errorAccordionTitle}>
          <AlertCircle size={13} className={styles.errorIcon} />
          <span>{parsed.title}</span>
        </div>
        <div className={styles.errorAccordionRight}>
          <span className={styles.errorBadge}>Error</span>
          {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </div>
      </div>

      {open && (
        <div className={styles.errorAccordionBody}>
          {parsed.tableData.length > 0 && (
            <div className={styles.errorTableWrap}>
              <table className={styles.errorTable}>
                <tbody>
                  {parsed.tableData.map((row, idx) => (
                    <tr key={idx}>
                      <td className={styles.errorTableKey}>{row.key}</td>
                      <td className={styles.errorTableVal}>{row.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <details className={styles.rawErrorDetails}>
            <summary>Raw Provider Output</summary>
            <pre className={styles.rawErrorPre}>{parsed.raw}</pre>
          </details>
        </div>
      )}
    </div>
  );
}



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
  const { data: availableModels } = useModels();
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
  const [liveTraceSteps, setLiveTraceSteps] = useState<TraceStep[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);

  function handleStop() {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }

  // Docked accordion state for space-saving: "changes" | "commands" | null
  const [dockedPanel, setDockedPanel] = useState<"changes" | "commands" | null>(null);

  // Textarea auto-expansion up to 3 lines
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  function adjustTextareaHeight(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    const scrollHeight = el.scrollHeight;
    const maxHeight = 68; // ~3 lines at 1.45 line-height
    el.style.height = `${Math.min(scrollHeight, maxHeight)}px`;
    el.style.overflowY = scrollHeight > maxHeight ? "auto" : "hidden";
  }

  useEffect(() => {
    if (!input && textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.overflowY = "hidden";
    }
  }, [input]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter") {
      if (e.ctrlKey || e.metaKey) {
        // Ctrl+Enter or Cmd+Enter: insert newline
        e.preventDefault();
        const target = e.currentTarget;
        const start = target.selectionStart;
        const end = target.selectionEnd;
        const val = target.value;
        const nextVal = val.substring(0, start) + "\n" + val.substring(end);
        setInput(nextVal);
        setTimeout(() => {
          target.selectionStart = target.selectionEnd = start + 1;
          adjustTextareaHeight(target);
        }, 0);
      } else if (!e.shiftKey) {
        // Plain Enter: send message
        e.preventDefault();
        handleSend();
      }
    }
  }

  const { data: actions } = useAiActions();
  const approveAction = useApproveAction();
  const rejectAction = useRejectAction();
  const undoAction = useUndoAction();

  // Derived messages for current conversation thread
  const messages: LocalMessage[] = [...(history ?? []), ...newMessages];

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
    if (!customText) {
      setInput("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
        textareaRef.current.style.overflowY = "hidden";
      }
    }
    setNewMessages((m) => [...m, { role: "user", content: text }]);
    setIsGenerating(true);
    setLiveStatus("Starting Copilot reasoning...");
    setLiveThinking("");
    setLiveTraceSteps([]);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const accumulatedSteps: TraceStep[] = [];
    let finalReply = "";
    let accumulatedThinking = "";
    let currentTurnState: Record<string, unknown> | null = null;
    let currentConversationId: string | null = activeConversationId;
    let isFinal = false;
    let stepCount = 0;
    const MAX_STEPS = 30;

    try {
      while (!isFinal && !controller.signal.aborted && stepCount < MAX_STEPS) {
        stepCount++;
        let stepSucceeded = false;
        let lastStepError: Error | null = null;

        // Resilient retry loop: up to 3 attempts per atomic step
        for (let attempt = 1; attempt <= 3; attempt++) {
          if (controller.signal.aborted) break;

          if (attempt > 1) {
            setLiveStatus(`Server took longer to respond. Retrying... (Attempt ${attempt} of 3)`);
            const waitTime = attempt === 2 ? 1500 : 3000;
            await new Promise((resolve) => {
              const timer = setTimeout(resolve, waitTime);
              controller.signal.addEventListener(
                "abort",
                () => {
                  clearTimeout(timer);
                  resolve(null);
                },
                { once: true }
              );
            });
            if (controller.signal.aborted) break;
          }

          // Per-step safety controller linked to main abort controller
          const stepAbortController = new AbortController();
          const onMainAbort = () => stepAbortController.abort();
          controller.signal.addEventListener("abort", onMainAbort, { once: true });
          const stepTimer = setTimeout(() => {
            stepAbortController.abort();
          }, 50000); // 50s per step safety timeout (within 55s route duration)

          let buffer = "";
          try {
            const requestBody: Record<string, unknown> = {
              mode: chatMode,
              model: selectedModel,
              conversationId: currentConversationId,
              stream: true,
            };

            if (stepCount === 1 && !currentTurnState) {
              requestBody.message = text;
            } else {
              requestBody.message = "";
              requestBody.turnState = currentTurnState;
            }

            const response = await fetch("/api/chat", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              signal: stepAbortController.signal,
              body: JSON.stringify(requestBody),
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

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });
              const chunks = buffer.split(/\r?\n\r?\n/);
              buffer = chunks.pop() ?? "";

              for (const chunk of chunks) {
                const dataLine = chunk.split(/\r?\n/).find((l) => l.startsWith("data:"));
                if (!dataLine) continue;
                const jsonStr = dataLine.slice(dataLine.indexOf(":") + 1).trim();
                if (!jsonStr) continue;
                let data: {
                  type: string;
                  text?: string;
                  reply?: string;
                  error?: string;
                  toolName?: string;
                  toolArgs?: Record<string, unknown>;
                  isError?: boolean;
                  conversationId?: string;
                  conversationTitle?: string;
                  isFinal?: boolean;
                  nextTurnState?: Record<string, unknown>;
                };
                try {
                  data = JSON.parse(jsonStr);
                } catch {
                  continue;
                }

                if (data.type === "status") {
                  setLiveStatus(data.text ?? null);
                  accumulatedSteps.push({
                    id: "status-" + Date.now() + Math.random(),
                    kind: "status",
                    title: data.text ?? "Status update",
                    status: "done",
                    timestamp: Date.now(),
                  });
                  setLiveTraceSteps([...accumulatedSteps]);
                } else if (data.type === "thinking") {
                  const newThought = data.text ?? "";
                  accumulatedThinking += (accumulatedThinking ? "\n\n" : "") + newThought;
                  setLiveThinking(accumulatedThinking);
                  accumulatedSteps.push({
                    id: "thought-" + Date.now() + Math.random(),
                    kind: "thought",
                    title: "Reasoning",
                    detail: newThought,
                    status: "done",
                    timestamp: Date.now(),
                  });
                  setLiveTraceSteps([...accumulatedSteps]);
                } else if (data.type === "tool_call") {
                  setLiveStatus(`Executing: ${data.toolName ?? "tool"}...`);
                  accumulatedSteps.push({
                    id: "tool-" + (data.toolName ?? "call") + "-" + Date.now(),
                    kind: "tool",
                    title: data.toolName ?? "Tool Call",
                    toolName: data.toolName,
                    toolArgs: data.toolArgs,
                    status: "running",
                    timestamp: Date.now(),
                  });
                  setLiveTraceSteps([...accumulatedSteps]);
                } else if (data.type === "tool_result") {
                  const matchingTool = [...accumulatedSteps].reverse().find((s) => s.kind === "tool" && s.toolName === data.toolName);
                  if (matchingTool) {
                    matchingTool.status = data.isError ? "error" : "done";
                    matchingTool.toolResult = data.text;
                    matchingTool.isError = data.isError;
                    matchingTool.durationSecs = Math.floor((Date.now() - matchingTool.timestamp) / 1000);
                  }
                  setLiveTraceSteps([...accumulatedSteps]);
                } else if (data.type === "step_done") {
                  currentTurnState = data.nextTurnState ?? null;
                  if (data.conversationId) {
                    currentConversationId = data.conversationId;
                    if (data.conversationId !== activeConversationId) {
                      setActiveConversationId(data.conversationId);
                    }
                  }
                  qc.invalidateQueries({ queryKey: ["ai-actions"] });
                  stepSucceeded = true;
                } else if (data.type === "done") {
                  isFinal = true;
                  finalReply = data.reply ?? "";
                  if (data.conversationId) {
                    currentConversationId = data.conversationId;
                    if (data.conversationId !== activeConversationId) {
                      setActiveConversationId(data.conversationId);
                    }
                  }
                  qc.invalidateQueries({ queryKey: ["ai-actions"] });
                  qc.invalidateQueries({ queryKey: ["conversations"] });
                  qc.invalidateQueries({ queryKey: ["goal-context"] });
                  stepSucceeded = true;
                } else if (data.type === "stopped") {
                  isFinal = true;
                  stepSucceeded = true;
                } else if (data.type === "error") {
                  throw new Error(data.error ?? "Unknown Copilot error");
                }
                // heartbeat events are keep-alive pings — ignore
              }
            }

            // If the stream ended without step_done/done, the server likely timed out
            if (!stepSucceeded && !stepAbortController.signal.aborted) {
              throw new Error("Connection lost — the server may have timed out. Please try again.");
            }

            if (stepSucceeded) {
              break; // Step finished successfully, break retry loop to continue outer step loop
            }
          } catch (stepErr: unknown) {
            const isUserAborted = controller.signal.aborted;
            const isStepTimeout = !isUserAborted && stepAbortController.signal.aborted;

            if (isUserAborted) {
              throw stepErr; // Explicit user stop, escape immediately
            }
            if (isStepTimeout) {
              // Step timed out but user didn't stop — treat as retryable
              lastStepError = new Error("Request timed out — retrying...");
              if (attempt < 3) continue;
            }
            lastStepError = stepErr instanceof Error ? stepErr : new Error(String(stepErr));
            if (attempt === 3) {
              throw lastStepError;
            }
          } finally {
            clearTimeout(stepTimer);
            controller.signal.removeEventListener("abort", onMainAbort);
          }
        }

        if (!stepSucceeded && !controller.signal.aborted) {
          if (lastStepError) throw lastStepError;
          break;
        }
      }

      if (finalReply) {
        setNewMessages((m) => [
          ...m,
          {
            role: "assistant",
            content: finalReply,
            thinkingContent: accumulatedThinking || undefined,
            traceSteps: accumulatedSteps.length > 0 ? [...accumulatedSteps] : undefined,
          },
        ]);
      }
    } catch (err: unknown) {
      // ONLY check the main controller — step-timeout AbortErrors should NOT
      // be classified as "user stopped". This was the root cause of false
      // "Generation stopped by user" messages.
      const isAborted = controller.signal.aborted;
      if (isAborted) {
        setNewMessages((m) => [
          ...m,
          {
            role: "assistant",
            content: finalReply ? `${finalReply}\n\n*(Generation stopped by user)*` : "*(Generation stopped by user)*",
            thinkingContent: accumulatedThinking || undefined,
            traceSteps: accumulatedSteps.length > 0 ? [...accumulatedSteps] : undefined,
            isStopped: true,
          },
        ]);
      } else {
        const errorMsg = err instanceof Error ? err.message : "Failed to communicate with Copilot";
        if (!finalReply && !accumulatedThinking && !customText) {
          setInput(text);
        }
        setNewMessages((m) => [
          ...m,
          {
            role: "assistant",
            content: finalReply || "*(Response interrupted)*",
            thinkingContent: accumulatedThinking || undefined,
            traceSteps: accumulatedSteps.length > 0 ? [...accumulatedSteps] : undefined,
            error: errorMsg,
          },
        ]);
      }
    } finally {
      setIsGenerating(false);
      setLiveStatus(null);
      abortControllerRef.current = null;
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
            {m.role === "assistant" && ((m.traceSteps && m.traceSteps.length > 0) || m.thinkingContent) && (
              <ThinkingAccordion
                content={m.thinkingContent}
                steps={m.traceSteps}
                isLive={false}
              />
            )}
            {m.role === "assistant" ? <MarkdownContent content={m.content} /> : m.content}
            {m.error && <ErrorAccordion error={m.error} />}
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
          <div className={`${styles.msg} ${styles.assistant}`}>
            <div className={styles.role}>Copilot</div>
            <ThinkingAccordion
              content={liveThinking}
              steps={liveTraceSteps}
              status={liveStatus}
              isLive={true}
            />
          </div>
        )}
      </div>

      {dockedPanel === "changes" && (
        <div className={styles.dockedAccordion}>
          <div className={styles.dockedHeader} onClick={() => setDockedPanel(null)}>
            <div className={styles.dockedTitle}>
              <History size={12} className={styles.dockedIcon} />
              <span>Recent AI changes ({recentHistory.length})</span>
            </div>
            <button
              type="button"
              className={styles.dockedCloseBtn}
              onClick={(e) => {
                e.stopPropagation();
                setDockedPanel(null);
              }}
              title="Close"
            >
              <X size={12} />
            </button>
          </div>
          <div className={styles.dockedBody}>
            {recentHistory.length === 0 ? (
              <div className={styles.undoDesc}>No changes yet</div>
            ) : (
              recentHistory.map((a) => (
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
              ))
            )}
          </div>
        </div>
      )}

      {dockedPanel === "commands" && (
        <div className={styles.dockedAccordion}>
          <div className={styles.dockedHeader} onClick={() => setDockedPanel(null)}>
            <div className={styles.dockedTitle}>
              <Zap size={12} className={styles.dockedIcon} />
              <span>Special Commands</span>
            </div>
            <button
              type="button"
              className={styles.dockedCloseBtn}
              onClick={(e) => {
                e.stopPropagation();
                setDockedPanel(null);
              }}
              title="Close"
            >
              <X size={12} />
            </button>
          </div>
          <div className={styles.dockedBody}>
            <button
              type="button"
              className={styles.specialCmdItem}
              onClick={() => {
                setDockedPanel(null);
                handleTriggerSprint();
              }}
              disabled={isGenerating}
            >
              <div className={styles.cmdItemTitle}>
                <CalendarClock size={13} color="#a78bfa" />
                <span>Plan Next 7-Day Sprint</span>
              </div>
              <div className={styles.cmdItemDesc}>
                Review Goals & study limits, check unfinished tasks, and plan next 7 days.
              </div>
            </button>
          </div>
        </div>
      )}

      <div className={styles.inputWrap}>
        {/* Suggest / Update toggle, Special Commands button, Recent Changes button, and Model select */}
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

            <button
              type="button"
              className={`${styles.controlToggleBtn} ${dockedPanel === "commands" ? styles.active : ""}`}
              onClick={() => setDockedPanel((cur) => (cur === "commands" ? null : "commands"))}
              title="Special commands"
              aria-label="Special commands"
            >
              <Zap size={13} />
            </button>

            <button
              type="button"
              className={`${styles.controlToggleBtn} ${dockedPanel === "changes" ? styles.active : ""}`}
              onClick={() => setDockedPanel((cur) => (cur === "changes" ? null : "changes"))}
              title={`Recent AI changes${recentHistory.length > 0 ? ` (${recentHistory.length})` : ""}`}
              aria-label="Recent AI changes"
            >
              <History size={13} />
            </button>
          </div>

          <select
            className={styles.modelSelect}
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            title="Select Gemini Model"
          >
            {(availableModels ?? []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.inputRow}>
          <textarea
            ref={textareaRef}
            className={styles.textInput}
            placeholder="Ask Copilot or request changes… (Enter to send, Ctrl+Enter for newline)"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              adjustTextareaHeight(e.target);
            }}
            onKeyDown={handleKeyDown}
            disabled={isGenerating}
            rows={1}
          />
          {isGenerating ? (
            <button
              type="button"
              className={styles.stopBtn}
              onClick={handleStop}
              title="Stop generation"
            >
              <Square size={11} />
              <span>Stop</span>
            </button>
          ) : (
            <button
              type="button"
              className={styles.send}
              disabled={!input.trim()}
              onClick={() => handleSend()}
            >
              Send
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
