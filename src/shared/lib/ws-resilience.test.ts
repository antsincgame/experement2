// Unit coverage for the WS resilience policy: which active project gets re-synced on
// reconnect (C4), and how a schema-rejected agent message is made traceable (M5).
import { describe, expect, it } from "vitest";
import { CREATING_PROJECT_SLUG } from "@/shared/lib/creation-flow";
import {
  describeDroppedMessage,
  shouldResyncActiveProjectOnReconnect,
} from "@/shared/lib/ws-resilience";

describe("shouldResyncActiveProjectOnReconnect", () => {
  it("resyncs a project stuck in a non-terminal status after reconnect", () => {
    expect(shouldResyncActiveProjectOnReconnect("alpha", "generating")).toBe(true);
    expect(shouldResyncActiveProjectOnReconnect("alpha", "building")).toBe(true);
  });

  it("does NOT resync a project already in a terminal status", () => {
    expect(shouldResyncActiveProjectOnReconnect("alpha", "ready")).toBe(false);
    expect(shouldResyncActiveProjectOnReconnect("alpha", "error")).toBe(false);
    expect(shouldResyncActiveProjectOnReconnect("alpha", "idle")).toBe(false);
  });

  it("never resyncs the __creating__ placeholder (no backend project → would 404)", () => {
    expect(shouldResyncActiveProjectOnReconnect(CREATING_PROJECT_SLUG, "generating")).toBe(false);
  });

  it("does nothing when there is no active project", () => {
    expect(shouldResyncActiveProjectOnReconnect(null, "generating")).toBe(false);
  });
});

describe("describeDroppedMessage", () => {
  it("names the offending type so a dropped event is traceable", () => {
    const raw = '{"type":"future_event","payload":1}';
    expect(describeDroppedMessage(JSON.parse(raw), raw)).toContain("type=future_event");
  });

  it("marks a message with no type field", () => {
    const raw = '{"payload":1}';
    expect(describeDroppedMessage(JSON.parse(raw), raw)).toContain("(no type field)");
  });

  it("tolerates a non-object payload", () => {
    expect(describeDroppedMessage(null, "null")).toContain("(no type field)");
  });

  it("truncates a huge payload to keep the log bounded", () => {
    const raw = `{"type":"x","blob":"${"a".repeat(5000)}"}`;
    expect(describeDroppedMessage(JSON.parse(raw), raw).length).toBeLessThan(260);
  });
});
