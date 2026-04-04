// Verifies that frontend WebSocket payload parsing rejects malformed agent messages before they hit the store.
import { describe, expect, it } from "vitest";
import {
  OutgoingWsMessageSchema,
  parseIncomingWsMessage,
} from "./ws-messages";

describe("parseIncomingWsMessage", () => {
  it("parses a scoped preview event", () => {
    const message = parseIncomingWsMessage({
      type: "preview_ready",
      projectName: "demo-app",
      port: 8081,
      proxyUrl: "http://127.0.0.1:3100/preview/demo-app/",
    });

    expect(message).toEqual({
      type: "preview_ready",
      projectName: "demo-app",
      port: 8081,
      proxyUrl: "http://127.0.0.1:3100/preview/demo-app/",
    });
  });

  it("rejects malformed payloads", () => {
    expect(parseIncomingWsMessage({ type: "preview_ready", port: "8081" })).toBeNull();
    expect(parseIncomingWsMessage({ foo: "bar" })).toBeNull();
  });
});

describe("OutgoingWsMessageSchema", () => {
  it("accepts a typed iterate payload", () => {
    const payload = {
      type: "iterate",
      requestId: "7f34af80-790f-42d7-8ff5-5de444ce7127",
      projectName: "demo-app",
      userRequest: "Add a search field",
      chatHistory: [
        { role: "user", content: "Build a notes app" },
        { role: "assistant", content: "Created the scaffold" },
      ],
      lmStudioUrl: "http://localhost:1234",
    };

    expect(OutgoingWsMessageSchema.safeParse(payload).success).toBe(true);
  });
});
