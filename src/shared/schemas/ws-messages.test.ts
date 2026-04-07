// Verifies that frontend WebSocket payload parsing enforces scoped preview/build contracts before store updates.
import { describe, expect, it } from "vitest";
import {
  OutgoingWsMessageSchema,
  parseIncomingWsMessage,
} from "./ws-messages";

describe("parseIncomingWsMessage", () => {
  it("parses a scoped preview event", () => {
    const message = parseIncomingWsMessage({
      type: "preview_ready",
      requestId: "7f34af80-790f-42d7-8ff5-5de444ce7127",
      projectName: "demo-app",
      buildId: "11111111-1111-4111-8111-111111111111",
      port: 8081,
      proxyUrl: "http://127.0.0.1:3100/preview/demo-app/",
    });

    expect(message).toEqual({
      type: "preview_ready",
      requestId: "7f34af80-790f-42d7-8ff5-5de444ce7127",
      projectName: "demo-app",
      buildId: "11111111-1111-4111-8111-111111111111",
      port: 8081,
      proxyUrl: "http://127.0.0.1:3100/preview/demo-app/",
    });
  });

  it("parses preview status updates with build metadata", () => {
    const message = parseIncomingWsMessage({
      type: "preview_status",
      requestId: "7f34af80-790f-42d7-8ff5-5de444ce7127",
      projectName: "demo-app",
      buildId: "22222222-2222-4222-8222-222222222222",
      previewStatus: "error",
      error: "Metro crashed",
    });

    expect(message).toEqual({
      type: "preview_status",
      requestId: "7f34af80-790f-42d7-8ff5-5de444ce7127",
      projectName: "demo-app",
      buildId: "22222222-2222-4222-8222-222222222222",
      previewStatus: "error",
      error: "Metro crashed",
    });
  });

  it("rejects malformed payloads", () => {
    expect(parseIncomingWsMessage({ type: "preview_ready", port: "8081" })).toBeNull();
    expect(parseIncomingWsMessage({
      type: "preview_ready",
      requestId: "7f34af80-790f-42d7-8ff5-5de444ce7127",
      projectName: "demo-app",
      port: 8081,
      proxyUrl: "http://127.0.0.1:3100/preview/demo-app/",
    })).toBeNull();
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
