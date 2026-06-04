// Verifies repaired JSON parsing so malformed LLM responses fail safely instead of throwing.
import { describe, expect, it } from "vitest";
import { balanceTruncatedJson, repairJson, safeJsonParse } from "./json-repair.js";

describe("json-repair", () => {
  it("repairs fenced JSON with trailing commas", () => {
    const repaired = repairJson("```json\n{\n  \"name\": \"demo\",\n}\n```");

    expect(repaired).toBe('{\n  "name": "demo"}');
  });

  it("parses repaired JSON payloads", () => {
    const parsed = safeJsonParse("```json\n{\n  \"name\": \"demo\",\n}\n```");

    expect(parsed).toEqual({ name: "demo" });
  });

  it("returns null when JSON cannot be recovered", () => {
    expect(safeJsonParse("{")).toBeNull();
    expect(safeJsonParse("not json at all")).toBeNull();
  });

  describe("truncated JSON recovery (planner cut off by token budget)", () => {
    it("closes an object truncated mid-array", () => {
      const truncated =
        '{"name":"todo","files":[{"path":"app/index.tsx","type":"screen"}';
      expect(safeJsonParse(truncated)).toEqual({
        name: "todo",
        files: [{ path: "app/index.tsx", type: "screen" }],
      });
    });

    it("closes an object truncated mid-string value", () => {
      const truncated = '{"name":"todo","description":"A todo app that';
      expect(safeJsonParse(truncated)).toEqual({
        name: "todo",
        description: "A todo app that",
      });
    });

    it("drops a dangling trailing comma", () => {
      expect(safeJsonParse('{"a":1,"b":2,')).toEqual({ a: 1, b: 2 });
    });

    it("backtracks past a dangling key with no value", () => {
      expect(safeJsonParse('{"a":1,"b"')).toEqual({ a: 1 });
    });

    it("recovers truncated JSON wrapped in an unclosed code fence", () => {
      const truncated = '```json\n{"name":"todo","files":[';
      expect(safeJsonParse(truncated)).toEqual({ name: "todo", files: [] });
    });

    it("balanceTruncatedJson returns parseable text or null", () => {
      const balanced = balanceTruncatedJson('{"a":[1,2');
      expect(balanced).not.toBeNull();
      expect(JSON.parse(balanced as string)).toEqual({ a: [1, 2] });
      expect(balanceTruncatedJson("{")).toBeNull();
      expect(balanceTruncatedJson("plain text")).toBeNull();
    });
  });
});
