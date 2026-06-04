import { describe, it, expect } from "vitest";
import { buildIterateChatHistory } from "./iterate-chat-history";
import type { ChatMessage } from "@/features/chat/schemas/message.schema";

describe("buildIterateChatHistory", () => {
  it("drops assistant rows with empty content (reasoning-only)", () => {
    const messages: ChatMessage[] = [
      {
        id: "1",
        role: "user",
        content: "Продолжай",
        timestamp: 1,
        status: "complete",
      },
      {
        id: "2",
        role: "assistant",
        content: "",
        thinking: "Planning next files…",
        timestamp: 2,
        status: "complete",
      },
    ];
    expect(buildIterateChatHistory(messages)).toEqual([
      { role: "user", content: "Продолжай" },
      { role: "assistant", content: "Planning next files…" },
    ]);
  });

  it("omits hidden system-style assistant process rows when marked hidden", () => {
    const messages: ChatMessage[] = [
      {
        id: "1",
        role: "assistant",
        content: "hidden",
        timestamp: 1,
        status: "complete",
        isHidden: true,
      },
      { id: "2", role: "user", content: "fix toolbar", timestamp: 2, status: "complete" },
    ];
    expect(buildIterateChatHistory(messages)).toEqual([
      { role: "user", content: "fix toolbar" },
    ]);
  });
});
