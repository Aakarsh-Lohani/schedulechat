export interface ChatTurnMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatProgressEvent {
  type: "thinking" | "status" | "tool_call" | "tool_result";
  text: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  isError?: boolean;
}

export interface TraceStep {
  id: string;
  kind: "thought" | "tool" | "status";
  title: string;
  detail?: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolResult?: string;
  isError?: boolean;
  status: "running" | "done" | "error";
  timestamp: number;
  durationSecs?: number;
}

export interface ChatTurnInput {
  userId: string;
  mode: "suggest" | "update";
  systemPrompt: string;
  /** Prior turns, oldest first, NOT including the newest user message (already the last item). */
  history: ChatTurnMessage[];
  model?: string;
  onProgress?: (event: ChatProgressEvent) => void;
}

export interface ChatTurnResult {
  replyText: string;
  createdActionIds: string[];
  thinkingSteps?: string[];
}

export interface TurnState {
  provider: "gemini" | "anthropic";
  stepNumber: number;
  geminiContents?: unknown[];
  anthropicMessages?: unknown[];
  createdActionIds: string[];
  accumulatedThinking: string[];
  thoughtSignatures?: Record<string, string>;
}

export interface ChatStepInput {
  userId: string;
  mode: "suggest" | "update";
  systemPrompt: string;
  history: ChatTurnMessage[];
  message?: string;
  model?: string;
  turnState?: TurnState;
  onProgress?: (event: ChatProgressEvent) => void;
}

export interface ChatStepResult {
  isFinal: boolean;
  replyText?: string;
  createdActionIds: string[];
  thinkingSteps?: string[];
  nextTurnState?: TurnState;
}
