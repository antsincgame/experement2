// Ensures auto chat-model selection skips embedding models (fixes enhance when embed is listed first).
import { describe, expect, it } from "vitest";
import { pickChatModelFromIds } from "./chat-model.js";

describe("pickChatModelFromIds", () => {
  it("skips embedding model when a chat model is also available", () => {
    expect(
      pickChatModelFromIds([
        "text-embedding-nomic-embed-text-v1.5",
        "qwen/qwen3-coder-32b",
      ])
    ).toBe("qwen/qwen3-coder-32b");
  });

  it("prefers instruct/coder names among chat models", () => {
    expect(
      pickChatModelFromIds(["llama-3.2-1b", "mistral-7b-instruct-v0.3"])
    ).toBe("mistral-7b-instruct-v0.3");
  });

  it("returns null for empty list", () => {
    expect(pickChatModelFromIds([])).toBeNull();
  });

  it("falls back to first id when only embedding models are listed", () => {
    expect(pickChatModelFromIds(["nomic-embed-text"])).toBe("nomic-embed-text");
  });
});
