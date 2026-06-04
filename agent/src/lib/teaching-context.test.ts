// Teaching-context budget: golden preserved, RAG trimmed by section from the top.
import { describe, expect, it } from "vitest";
import { MAX_TEACHING_CONTEXT_CHARS } from "./generation-contract.js";
import { composeTeachingContext, trimSectionsToBudget } from "./teaching-context.js";

describe("trimSectionsToBudget", () => {
  it("returns text unchanged when under budget", () => {
    expect(trimSectionsToBudget("alpha\n\nbeta", 500)).toBe("alpha\n\nbeta");
  });

  it("keeps leading sections and appends a truncation marker", () => {
    const first = "A".repeat(400);
    const second = "B".repeat(400);
    const text = `${first}\n\n${second}`;
    const trimmed = trimSectionsToBudget(text, 450);
    expect(trimmed).toContain(first);
    expect(trimmed).not.toContain(second);
    expect(trimmed).toContain("[teaching context truncated");
  });
});

describe("composeTeachingContext", () => {
  it("passes through when total size is within budget", () => {
    const result = composeTeachingContext("rag docs", "## WORKING EXAMPLE\ncode");
    expect(result).toBe("rag docs\n\n## WORKING EXAMPLE\ncode");
  });

  it("keeps golden intact and trims RAG when combined size exceeds budget", () => {
    const golden = "## WORKING EXAMPLE\n" + "G".repeat(800);
    const rag = ["TAMAGUI CORE", "EXTRA A".repeat(5000), "EXTRA B".repeat(5000)].join("\n\n");
    const result = composeTeachingContext(rag, golden);
    expect(result.endsWith(golden.trim())).toBe(true);
    expect(result).toContain("TAMAGUI CORE");
    expect(result).not.toContain("EXTRA B");
    expect(result.length).toBeLessThanOrEqual(MAX_TEACHING_CONTEXT_CHARS + 80);
  });

  it("trims RAG-only context when there is no golden block", () => {
    const rag = "CORE\n\n" + "X".repeat(MAX_TEACHING_CONTEXT_CHARS + 2000);
    const result = composeTeachingContext(rag, "");
    expect(result).toContain("CORE");
    expect(result).toContain("[teaching context truncated");
    expect(result.length).toBeLessThanOrEqual(MAX_TEACHING_CONTEXT_CHARS + 80);
  });
});
