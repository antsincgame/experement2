// Sanitize chat messages before iterate WS — reasoning rows have empty content and break Zod.
import type { ChatMessage } from "@/features/chat/schemas/message.schema";

export interface IterateChatTurn {
  role: "user" | "assistant";
  content: string;
}

export const buildIterateChatHistory = (
  messages: ChatMessage[],
): IterateChatTurn[] =>
  messages
    .filter(
      (message): message is ChatMessage & { role: "user" | "assistant" } =>
        !message.isHidden &&
        (message.role === "user" || message.role === "assistant"),
    )
    .map((message) => ({
      role: message.role,
      content: message.content.trim() || message.thinking?.trim() || "",
    }))
    .filter((turn) => turn.content.length > 0);
