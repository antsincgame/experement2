import { describe, it, expect } from "vitest";
import {
  extractPlanDescriptions,
  humanizePath,
  describeFile,
  buildFileMeanings,
  buildTerminalLines,
} from "@/shared/lib/generation-narration";
import type { GenerationFile } from "@/stores/project-store.types";

const plan = {
  name: "spendwise",
  files: [
    { path: "src/stores/expenseStore.ts", description: "Global expense state with Zustand" },
    { path: "app/(tabs)/index.tsx", description: "Home dashboard screen" },
    { path: "bad", description: "" },
    "not-an-object",
  ],
};

describe("extractPlanDescriptions", () => {
  it("maps file path to its model-authored description", () => {
    const map = extractPlanDescriptions(plan);
    expect(map["src/stores/expenseStore.ts"]).toBe("Global expense state with Zustand");
    expect(map["app/(tabs)/index.tsx"]).toBe("Home dashboard screen");
  });

  it("ignores blank descriptions and malformed entries", () => {
    const map = extractPlanDescriptions(plan);
    expect(map.bad).toBeUndefined();
    expect(Object.keys(map)).toHaveLength(2);
  });

  it("returns an empty map for null or shapeless plans", () => {
    expect(extractPlanDescriptions(null)).toEqual({});
    expect(extractPlanDescriptions({})).toEqual({});
    expect(extractPlanDescriptions({ files: "x" })).toEqual({});
  });
});

describe("humanizePath", () => {
  it("derives a readable label from a file path", () => {
    expect(humanizePath("src/stores/expenseStore.ts")).toBe("Expense store");
    expect(humanizePath("src/components/filter-sheet.tsx")).toBe("Filter sheet");
  });
});

describe("describeFile", () => {
  it("prefers the plan description, falls back to the humanized path", () => {
    const map = extractPlanDescriptions(plan);
    expect(describeFile("src/stores/expenseStore.ts", map)).toBe("Global expense state with Zustand");
    expect(describeFile("src/hooks/useTimer.ts", map)).toBe("Use timer");
  });
});

describe("buildFileMeanings", () => {
  it("attaches a meaning to every generation file without exposing code", () => {
    const files: GenerationFile[] = [
      { path: "src/stores/expenseStore.ts", code: "secret code", status: "done" },
      { path: "src/hooks/useTimer.ts", code: "more code", status: "streaming" },
    ];
    const result = buildFileMeanings(files, plan);
    expect(result).toEqual([
      { path: "src/stores/expenseStore.ts", status: "done", meaning: "Global expense state with Zustand" },
      { path: "src/hooks/useTimer.ts", status: "streaming", meaning: "Use timer" },
    ]);
    expect(JSON.stringify(result)).not.toContain("code");
  });
});

describe("buildTerminalLines", () => {
  it("emits a phase header and per-file progress with no raw code", () => {
    const files: GenerationFile[] = [
      { path: "src/stores/expenseStore.ts", code: "x", status: "done" },
      { path: "app/(tabs)/index.tsx", code: "y", status: "streaming" },
    ];
    const lines = buildTerminalLines("generating", files, plan);
    expect(lines[0]).toMatchObject({ tone: "phase" });
    expect(lines.some((l) => l.text.includes("\u2713 src/stores/expenseStore.ts"))).toBe(true);
    expect(lines.some((l) => l.text.includes("\u2192 app/(tabs)/index.tsx"))).toBe(true);
    expect(lines.some((l) => l.text.includes("Home dashboard screen"))).toBe(true);
  });

  it("returns no lines when idle with no files", () => {
    expect(buildTerminalLines("idle", [], null)).toEqual([]);
  });
});
