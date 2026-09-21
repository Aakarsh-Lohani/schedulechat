export interface ChatTurnMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatProgressEvent {
  type: "thinking" | "status";
  text: string;
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
