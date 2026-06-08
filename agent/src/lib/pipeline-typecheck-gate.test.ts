import { describe, it, expect } from "vitest";
import {
  shouldKeepFix,
  countTypeErrors,
  applyAutofixWithGate,
  revertRepairPhaseIfWorse,
  type GatedAutofixDeps,
  type GatedAutofixParams,
  type RepairGateDeps,
} from "./pipeline-typecheck-gate.js";
import type { MetroError } from "./auto-fixer.js";

const ERROR: MetroError = {
  type: "SyntaxError",
  file: "app/index.tsx",
  line: "1",
  raw: "app/index.tsx(1,1): error TS2304: Cannot find name 'View'",
};

// A real-shaped `tsc` line so countTypeErrors / the gate parse it like production.
const tscLine = (file: string, code = "TS2322"): string =>
  `${file}(1,1): error ${code}: Type 'number' is not assignable to type 'string'.`;

/**
 * Build a fake `autoFix` that, when it "applies" a fix, writes new content to the
 * given files through the same writeFile the gate revert uses — so a revert is
 * observable on the in-memory store. It records snapshots via onFix BEFORE
 * writing, mirroring the real applyBlock ordering.
 */
const makeFakeAutoFix = (
  store: Map<string, string>,
  opts: { apply: boolean; writes: Record<string, string> },
): GatedAutofixDeps["autoFix"] => {
  return async ({ onFix }) => {
    if (!opts.apply) {
      return { success: false, attempts: 1, lastError: "no blocks applied" };
    }
    for (const [filepath, replace] of Object.entries(opts.writes)) {
      // onFix fires BEFORE the write (matches production), so the gate snapshots
      // pre-fix content here.
      onFix?.({ type: "search_replace", filepath, search: "x", replace } as never);
      store.set(filepath, replace);
    }
    return { success: true, attempts: 1 };
  };
};

const makeDeps = (
  store: Map<string, string>,
  overrides: Partial<GatedAutofixDeps>,
): GatedAutofixDeps => ({
  autoFix: async () => ({ success: false, attempts: 1 }),
  readFile: (fp) => (store.has(fp) ? (store.get(fp) as string) : null),
  writeFile: (fp, content) => {
    store.set(fp, content);
  },
  ...overrides,
});

const baseParams = (baselineErrors: number): GatedAutofixParams => ({
  projectName: "vitest-gate",
  projectPath: "/tmp/vitest-gate",
  error: ERROR,
  baselineErrors,
});

describe("shouldKeepFix", () => {
  it("keeps a fix that reduces type errors", () => {
    expect(shouldKeepFix(5, 2)).toBe(true);
  });
  it("keeps a fix that leaves the error count unchanged", () => {
    expect(shouldKeepFix(3, 3)).toBe(true);
  });
  it("rejects a fix that increases type errors", () => {
    expect(shouldKeepFix(2, 5)).toBe(false);
  });
});

describe("countTypeErrors", () => {
  it("counts the structured diagnostics in tsc output", () => {
    const out = [tscLine("app/a.tsx", "TS2322"), tscLine("app/b.tsx", "TS2304")].join("\n");
    expect(countTypeErrors(out)).toBe(2);
  });
  it("returns 0 for clean output", () => {
    expect(countTypeErrors("")).toBe(0);
  });
});

describe("applyAutofixWithGate", () => {
  it("keeps a fix that REDUCES (or keeps) type errors", async () => {
    const store = new Map<string, string>([["app/index.tsx", "BEFORE"]]);
    // Baseline had 2 errors; after the fix the typecheck reports 1 → keep.
    const deps = makeDeps(store, {
      autoFix: makeFakeAutoFix(store, { apply: true, writes: { "app/index.tsx": "AFTER" } }),
      runTypecheck: async () => ({
        success: false,
        combinedOutput: tscLine("app/index.tsx"),
      }),
    });

    const result = await applyAutofixWithGate(deps, baseParams(2));

    expect(result.applied).toBe(true);
    expect(result.reverted).toBe(false);
    expect(result.afterErrors).toBe(1);
    expect(result.lastAppliedBlock).toMatchObject({ filepath: "app/index.tsx" });
    // Fix kept → store holds the new content.
    expect(store.get("app/index.tsx")).toBe("AFTER");
  });

  it("keeps a fix that drives errors to zero (typecheck success)", async () => {
    const store = new Map<string, string>([["app/index.tsx", "BEFORE"]]);
    const deps = makeDeps(store, {
      autoFix: makeFakeAutoFix(store, { apply: true, writes: { "app/index.tsx": "AFTER" } }),
      runTypecheck: async () => ({ success: true, combinedOutput: "" }),
    });

    const result = await applyAutofixWithGate(deps, baseParams(1));

    expect(result.applied).toBe(true);
    expect(result.reverted).toBe(false);
    expect(result.afterErrors).toBe(0);
    expect(store.get("app/index.tsx")).toBe("AFTER");
  });

  it("REVERTS a fix that INCREASES type errors and restores the snapshot", async () => {
    const store = new Map<string, string>([["app/index.tsx", "BEFORE"]]);
    let emitted: Record<string, unknown> | null = null;
    // Baseline had 1 error; after the fix the typecheck reports 3 → revert.
    const deps = makeDeps(store, {
      autoFix: makeFakeAutoFix(store, { apply: true, writes: { "app/index.tsx": "AFTER" } }),
      runTypecheck: async () => ({
        success: false,
        combinedOutput: [
          tscLine("app/index.tsx", "TS2322"),
          tscLine("app/index.tsx", "TS2304"),
          tscLine("app/other.tsx", "TS2339"),
        ].join("\n"),
      }),
      emit: (m) => {
        emitted = m;
      },
    });

    const result = await applyAutofixWithGate(deps, baseParams(1));

    expect(result.applied).toBe(false);
    expect(result.reverted).toBe(true);
    expect(result.afterErrors).toBe(3);
    expect(result.lastAppliedBlock).toBeNull();
    // The touched file is restored to its pre-fix snapshot.
    expect(store.get("app/index.tsx")).toBe("BEFORE");
    // A visible revert log line was emitted.
    expect(emitted).not.toBeNull();
    expect(JSON.stringify(emitted)).toContain("Reverted autofix");
  });

  it("keeps the fix (fallback) and does not throw when runTypecheck THROWS", async () => {
    const store = new Map<string, string>([["app/index.tsx", "BEFORE"]]);
    const deps = makeDeps(store, {
      autoFix: makeFakeAutoFix(store, { apply: true, writes: { "app/index.tsx": "AFTER" } }),
      runTypecheck: async () => {
        throw new Error("tsc spawn failed");
      },
    });

    const result = await applyAutofixWithGate(deps, baseParams(0));

    expect(result.applied).toBe(true);
    expect(result.reverted).toBe(false);
    expect(result.afterErrors).toBeNull();
    // Fallback to keeping the fix → new content stays.
    expect(store.get("app/index.tsx")).toBe("AFTER");
  });

  it("keeps the fix (fallback) when runTypecheck is unavailable", async () => {
    const store = new Map<string, string>([["app/index.tsx", "BEFORE"]]);
    const deps = makeDeps(store, {
      autoFix: makeFakeAutoFix(store, { apply: true, writes: { "app/index.tsx": "AFTER" } }),
      runTypecheck: undefined,
    });

    const result = await applyAutofixWithGate(deps, baseParams(0));

    expect(result.applied).toBe(true);
    expect(result.reverted).toBe(false);
    expect(store.get("app/index.tsx")).toBe("AFTER");
  });

  it("is a no-op when autoFix applies nothing (no typecheck run)", async () => {
    const store = new Map<string, string>([["app/index.tsx", "BEFORE"]]);
    let typecheckCalls = 0;
    const deps = makeDeps(store, {
      autoFix: makeFakeAutoFix(store, { apply: false, writes: {} }),
      runTypecheck: async () => {
        typecheckCalls++;
        return { success: true, combinedOutput: "" };
      },
    });

    const result = await applyAutofixWithGate(deps, baseParams(0));

    expect(result.applied).toBe(false);
    expect(result.reverted).toBe(false);
    expect(result.afterErrors).toBeNull();
    // Bounded/cheap: no extra typecheck when nothing was applied.
    expect(typecheckCalls).toBe(0);
    expect(store.get("app/index.tsx")).toBe("BEFORE");
  });

  it("reverts ALL touched files to their snapshots on regression", async () => {
    const store = new Map<string, string>([
      ["app/a.tsx", "A0"],
      ["app/b.tsx", "B0"],
    ]);
    const deps = makeDeps(store, {
      autoFix: makeFakeAutoFix(store, {
        apply: true,
        writes: { "app/a.tsx": "A1", "app/b.tsx": "B1" },
      }),
      runTypecheck: async () => ({
        success: false,
        combinedOutput: [
          tscLine("app/a.tsx"),
          tscLine("app/b.tsx"),
          tscLine("app/c.tsx"),
        ].join("\n"),
      }),
    });

    const result = await applyAutofixWithGate(deps, baseParams(0));

    expect(result.reverted).toBe(true);
    expect(store.get("app/a.tsx")).toBe("A0");
    expect(store.get("app/b.tsx")).toBe("B0");
  });

  it("does NOT throw when autoFix throws (idle-stall/network) — treats it as no fix applied", async () => {
    const store = new Map<string, string>([["app/index.tsx", "before"]]);
    const deps = makeDeps(store, {
      autoFix: async () => {
        throw new Error("LLM_STREAM_IDLE: model produced no output");
      },
      runTypecheck: async () => ({ success: false, combinedOutput: tscLine("app/index.tsx") }),
    });

    const result = await applyAutofixWithGate(deps, baseParams(1));

    expect(result.applied).toBe(false);
    expect(result.reverted).toBe(false);
    expect(result.fixResult.success).toBe(false);
    expect(result.fixResult.lastError).toContain("LLM_STREAM_IDLE");
    expect(store.get("app/index.tsx")).toBe("before"); // untouched
  });
});

describe("revertRepairPhaseIfWorse", () => {
  // A `tsc` result whose error count = number of "BROKEN" markers in the file(s).
  // Lets a fake typecheck reflect the ACTUAL on-disk state the gate restores/keeps.
  const tcForStore = (store: Map<string, string>, files: string[]) => async () => {
    const lines: string[] = [];
    for (const fp of files) {
      const count = (store.get(fp)?.match(/BROKEN/g) ?? []).length;
      for (let i = 0; i < count; i++) lines.push(tscLine(fp));
    }
    return lines.length === 0
      ? { success: true, combinedOutput: "" }
      : { success: false, combinedOutput: lines.join("\n") };
  };

  const repairDeps = (
    store: Map<string, string>,
    overrides: Partial<RepairGateDeps> = {},
  ): RepairGateDeps => ({
    readFile: (fp) => (store.has(fp) ? (store.get(fp) as string) : null),
    writeFile: (fp, content) => {
      store.set(fp, content);
    },
    ...overrides,
  });

  it("REVERTS repairs that broke a previously-clean file (0 → 1 errors)", async () => {
    const store = new Map<string, string>([["src/a.ts", "export const a = BROKEN"]]);
    const preRepair = new Map<string, string>([["src/a.ts", "export const a = 1"]]);
    const result = await revertRepairPhaseIfWorse(
      repairDeps(store, { runTypecheck: tcForStore(store, ["src/a.ts"]) }),
      "/tmp/p",
      preRepair,
    );
    expect(result.reverted).toBe(true);
    expect(store.get("src/a.ts")).toBe("export const a = 1"); // pre-repair restored
  });

  it("KEEPS repairs that reduced the error count (2 → 1 errors)", async () => {
    const store = new Map<string, string>([["src/a.ts", "BROKEN one"]]);
    const preRepair = new Map<string, string>([["src/a.ts", "BROKEN BROKEN two"]]);
    const result = await revertRepairPhaseIfWorse(
      repairDeps(store, { runTypecheck: tcForStore(store, ["src/a.ts"]) }),
      "/tmp/p",
      preRepair,
    );
    expect(result.reverted).toBe(false);
    expect(store.get("src/a.ts")).toBe("BROKEN one"); // repaired version kept
  });

  it("KEEPS a clean repaired project without a second typecheck", async () => {
    const store = new Map<string, string>([["src/a.ts", "export const a = 1"]]);
    const preRepair = new Map<string, string>([["src/a.ts", "export const a = BROKEN"]]);
    let calls = 0;
    const result = await revertRepairPhaseIfWorse(
      repairDeps(store, {
        runTypecheck: async () => {
          calls++;
          return { success: true, combinedOutput: "" };
        },
      }),
      "/tmp/p",
      preRepair,
    );
    expect(result.reverted).toBe(false);
    expect(result.afterErrors).toBe(0);
    expect(calls).toBe(1); // clean → no second typecheck
  });

  it("does nothing (and runs no typecheck) when no file changed", async () => {
    const store = new Map<string, string>([["src/a.ts", "same"]]);
    const preRepair = new Map<string, string>([["src/a.ts", "same"]]);
    let calls = 0;
    const result = await revertRepairPhaseIfWorse(
      repairDeps(store, {
        runTypecheck: async () => {
          calls++;
          return { success: false, combinedOutput: tscLine("src/a.ts") };
        },
      }),
      "/tmp/p",
      preRepair,
    );
    expect(result).toMatchObject({ reverted: false, changed: 0 });
    expect(calls).toBe(0);
  });

  it("keeps repairs (fail-safe) when runTypecheck is unavailable or throws", async () => {
    const store = new Map<string, string>([["src/a.ts", "export const a = BROKEN"]]);
    const preRepair = new Map<string, string>([["src/a.ts", "export const a = 1"]]);

    const noTc = await revertRepairPhaseIfWorse(repairDeps(store), "/tmp/p", preRepair);
    expect(noTc.reverted).toBe(false);
    expect(store.get("src/a.ts")).toBe("export const a = BROKEN"); // repairs kept

    const threwTc = await revertRepairPhaseIfWorse(
      repairDeps(store, {
        runTypecheck: async () => {
          throw new Error("tsc unavailable");
        },
      }),
      "/tmp/p",
      preRepair,
    );
    expect(threwTc.reverted).toBe(false);
    expect(store.get("src/a.ts")).toBe("export const a = BROKEN"); // still kept
  });
});
