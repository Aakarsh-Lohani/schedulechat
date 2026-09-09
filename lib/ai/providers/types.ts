export interface ChatTurnMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatTurnInput {
  userId: string;
  mode: "suggest" | "update";
  systemPrompt: string;
  /** Prior turns, oldest first, NOT including the newest user message (already the last item). */
  history: ChatTurnMessage[];
  model?: string;
}

export interface ChatTurnResult {
  replyText: string;
  createdActionIds: string[];
}
