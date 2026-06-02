export type MessageRole = "user" | "assistant" | "system";

export type MessageStatus = "pending" | "streaming" | "complete" | "error";

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  thinking?: string;
  timestamp: number;
  status: MessageStatus;
  isHidden?: boolean;
  isError?: boolean;
  errorFile?: string;
  errorDetails?: string;
  diffFilepath?: string;
  diffBefore?: string;
  diffAfter?: string;
}

export const createUserMessage = (content: string): ChatMessage => ({
  id: crypto.randomUUID(),
  role: "user",
  content,
  timestamp: Date.now(),
  status: "complete",
});

export const createAssistantMessage = (
  content: string,
  status: MessageStatus = "complete"
): ChatMessage => ({
  id: crypto.randomUUID(),
  role: "assistant",
  content,
  timestamp: Date.now(),
  status,
});

export const createReasoningMessage = (thinking: string): ChatMessage => ({
  id: crypto.randomUUID(),
  role: "assistant",
  content: "",
  thinking,
  timestamp: Date.now(),
  status: "complete",
});

export const createDiffMessage = (
  filepath: string,
  before: string,
  after: string
): ChatMessage => {
  const addedLines = after.split("\n").length - before.split("\n").length;
  const sign = addedLines >= 0 ? "+" : "";
  return {
    id: crypto.randomUUID(),
    role: "system",
    content: `Updated ${filepath} (${sign}${addedLines} lines)`,
    diffFilepath: filepath,
    diffBefore: before,
    diffAfter: after,
    timestamp: Date.now(),
    status: "complete",
  };
};

export const createSystemMessage = (
  content: string,
  isHidden = false
): ChatMessage => ({
  id: crypto.randomUUID(),
  role: "system",
  content,
  timestamp: Date.now(),
  status: "complete",
  isHidden,
});

export const createErrorMessage = (
  content: string,
  errorDetails?: string,
  errorFile?: string,
): ChatMessage => ({
  id: crypto.randomUUID(),
  role: "assistant",
  content,
  timestamp: Date.now(),
  status: "complete",
  isError: true,
  errorDetails,
  errorFile,
});
