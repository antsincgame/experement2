// Verifies repaired JSON parsing so malformed LLM responses fail safely instead of throwing.
import { describe, expect, it } from "vitest";
import { repairJson, safeJsonParse } from "./json-repair.js";

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
  });
});
