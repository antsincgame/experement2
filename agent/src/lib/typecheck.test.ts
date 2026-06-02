import { describe, it, expect } from "vitest";
import {
  parseTypeErrors,
  groupDiagnosticsByFile,
  isFixableProjectFile,
  formatDiagnosticsForPrompt,
} from "./typecheck.js";

// Real-world shaped tsc output, including a path with parentheses and a
// multi-line overload error — both taken from the project's soak reports.
const SAMPLE = [
  `app/(tabs)/_layout.tsx(12,22): error TS2322: Type '"calculator"' is not assignable to type '"settings" | "home"'.`,
  `src/hooks/usePomodoroTimer.ts(14,5): error TS2304: Cannot find name 'isRunning'.`,
  `src/components/CategoryChart.tsx(63,10): error TS2769: No overload matches this call.`,
  `  Overload 1 of 2, '(props: BarChartProps): BarChart', gave the following error.`,
  `    Property 'yAxisSuffix' is missing in type.`,
].join("\n");

describe("parseTypeErrors", () => {
  it("extracts file/line/col/code, handling paths that contain parentheses", () => {
    const diags = parseTypeErrors(SAMPLE);
    expect(diags).toHaveLength(3);
    expect(diags[0]).toMatchObject({
      filePath: "app/(tabs)/_layout.tsx",
      line: 12,
      column: 22,
      code: "TS2322",
    });
    expect(diags[1]).toMatchObject({
      filePath: "src/hooks/usePomodoroTimer.ts",
      code: "TS2304",
    });
  });

  it("folds indented continuation lines into the preceding message", () => {
    const diags = parseTypeErrors(SAMPLE);
    expect(diags[2].code).toBe("TS2769");
    expect(diags[2].message).toContain("No overload matches this call");
    expect(diags[2].message).toContain("yAxisSuffix");
  });

  it("returns an empty array for clean / non-error output", () => {
    expect(parseTypeErrors("")).toEqual([]);
    expect(parseTypeErrors("Found 0 errors. Watching for file changes.")).toEqual([]);
  });
});

describe("groupDiagnosticsByFile", () => {
  it("groups diagnostics by file path", () => {
    const grouped = groupDiagnosticsByFile(parseTypeErrors(SAMPLE));
    expect(grouped.size).toBe(3);
    expect(grouped.get("src/hooks/usePomodoroTimer.ts")).toHaveLength(1);
  });
});

describe("isFixableProjectFile", () => {
  it("accepts generated app/ and src/ TypeScript files", () => {
    expect(isFixableProjectFile("app/(tabs)/index.tsx")).toBe(true);
    expect(isFixableProjectFile("src/hooks/useThing.ts")).toBe(true);
  });

  it("rejects the scaffolded UI kit, the data layer, non-project paths, and non-TS files", () => {
    expect(isFixableProjectFile("src/ui/Icon.tsx")).toBe(false);
    expect(isFixableProjectFile("src/ui/index.ts")).toBe(false);
    expect(isFixableProjectFile("src/services/db.ts")).toBe(false);
    expect(isFixableProjectFile("node_modules/tamagui/index.ts")).toBe(false);
    expect(isFixableProjectFile("app/styles.css")).toBe(false);
  });

  it("still auto-fixes app-authored service files other than the blessed db layer", () => {
    expect(isFixableProjectFile("src/services/api.ts")).toBe(true);
  });
});

describe("formatDiagnosticsForPrompt", () => {
  it("lists each error and a deduped, code-specific hint section", () => {
    const out = formatDiagnosticsForPrompt(parseTypeErrors(SAMPLE));
    expect(out).toContain("TS2322");
    expect(out).toContain("TS2304");
    expect(out).toContain("How to fix");
  });
});
