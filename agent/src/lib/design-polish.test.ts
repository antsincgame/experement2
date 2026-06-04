import { describe, it, expect } from "vitest";
import { runDesignPolish, type DesignPolishDeps } from "./design-polish.js";

// In-memory fake of the side-effecting boundary so the loop is exercised
// deterministically without mocks (mirrors the injected-deps style elsewhere).
interface FakeOptions {
  files: Record<string, string>;
  /** Per-path response from critique; undefined means "no change" (null). */
  critiqueResults?: Record<string, string | null>;
  /** Validation outcome — defaults to always-valid. */
  validateResult?: boolean | (() => boolean);
}

interface FakeHarness {
  deps: DesignPolishDeps;
  writes: Array<{ path: string; content: string }>;
  emits: Array<{ pass: number; maxPasses: number; message: string }>;
  critiqueCalls: number;
  files: Record<string, string>;
}

const makeFake = (options: FakeOptions): FakeHarness => {
  const files = { ...options.files };
  const writes: Array<{ path: string; content: string }> = [];
  const emits: Array<{ pass: number; maxPasses: number; message: string }> = [];
  const harness = { writes, emits, critiqueCalls: 0, files } as FakeHarness;

  const validateResult = options.validateResult ?? true;

  harness.deps = {
    critique: async ({ path }) => {
      harness.critiqueCalls++;
      const result = options.critiqueResults?.[path];
      return result === undefined ? null : result;
    },
    validate: async () =>
      typeof validateResult === "function" ? validateResult() : validateResult,
    writeFile: (path, content) => {
      files[path] = content;
      writes.push({ path, content });
    },
    readFile: (path) => (path in files ? files[path] : null),
    emit: (pass, maxPasses, message) => emits.push({ pass, maxPasses, message }),
  };

  return harness;
};

describe("runDesignPolish", () => {
  it("stops early when critique returns null (no change)", async () => {
    const fake = makeFake({
      files: { "app/index.tsx": "const a = 1;" },
      critiqueResults: { "app/index.tsx": null },
    });

    const result = await runDesignPolish(["app/index.tsx"], 3, fake.deps);

    expect(result).toEqual({ passes: 1, changed: 0 });
    // Converged after the first zero-change pass — only one emit.
    expect(fake.emits).toHaveLength(1);
    expect(fake.writes).toHaveLength(0);
  });

  it("keeps a change when validate returns true", async () => {
    const fake = makeFake({
      files: { "app/index.tsx": "old" },
      critiqueResults: { "app/index.tsx": "new" },
      validateResult: true,
    });

    const result = await runDesignPolish(["app/index.tsx"], 1, fake.deps);

    expect(result.changed).toBe(1);
    // Wrote the improved content and never reverted it.
    expect(fake.writes).toEqual([{ path: "app/index.tsx", content: "new" }]);
    expect(fake.files["app/index.tsx"]).toBe("new");
  });

  it("reverts a change when validate returns false (anti-regression)", async () => {
    const fake = makeFake({
      files: { "app/index.tsx": "original" },
      critiqueResults: { "app/index.tsx": "broken" },
      validateResult: false,
    });

    const result = await runDesignPolish(["app/index.tsx"], 1, fake.deps);

    expect(result.changed).toBe(0);
    // writeFile called twice: first the new content, then the original (revert).
    expect(fake.writes).toEqual([
      { path: "app/index.tsx", content: "broken" },
      { path: "app/index.tsx", content: "original" },
    ]);
    expect(fake.files["app/index.tsx"]).toBe("original");
  });

  it("respects maxPasses (clamped to 1..4) and keeps improving each pass", async () => {
    let counter = 0;
    const fake = makeFake({
      files: { "app/index.tsx": "v0" },
      // Always return a fresh value so each pass accepts a change and the loop
      // never converges early — it should stop only at the pass ceiling (4).
      validateResult: true,
    });
    // Override critique to always produce new content.
    fake.deps.critique = async () => `v${++counter}`;

    const result = await runDesignPolish(["app/index.tsx"], 99, fake.deps);

    expect(result.passes).toBe(4);
    expect(fake.emits).toHaveLength(4);
    expect(fake.emits.every((e) => e.maxPasses === 4)).toBe(true);
  });

  it("emits exactly one progress call per pass", async () => {
    let counter = 0;
    const fake = makeFake({
      files: { "app/a.tsx": "a", "app/b.tsx": "b" },
      validateResult: true,
    });
    fake.deps.critique = async ({ content }) => `${content}-${++counter}`;

    await runDesignPolish(["app/a.tsx", "app/b.tsx"], 2, fake.deps);

    // Two passes ran (changes accepted in both) → two emits, one per pass.
    expect(fake.emits.map((e) => e.pass)).toEqual([1, 2]);
    expect(fake.emits.every((e) => e.maxPasses === 2)).toBe(true);
  });

  it("never throws when critique rejects — isolates per-file failures", async () => {
    const fake = makeFake({
      files: { "app/a.tsx": "a", "app/b.tsx": "b" },
      critiqueResults: { "app/b.tsx": "b-improved" },
      validateResult: true,
    });
    fake.deps.critique = async ({ path, content }) => {
      if (path === "app/a.tsx") throw new Error("model exploded");
      return `${content}-improved`;
    };

    const result = await runDesignPolish(["app/a.tsx", "app/b.tsx"], 1, fake.deps);

    // a.tsx failed but b.tsx still got polished.
    expect(result.changed).toBe(1);
    expect(fake.files["app/b.tsx"]).toBe("b-improved");
  });

  it("skips missing files (readFile → null) without calling critique", async () => {
    const fake = makeFake({
      files: { "app/index.tsx": "real" },
      critiqueResults: { "app/index.tsx": null },
    });

    const result = await runDesignPolish(["app/missing.tsx", "app/index.tsx"], 1, fake.deps);

    expect(result.changed).toBe(0);
    // critique was called once (for the existing file), never for the missing one.
    expect(fake.critiqueCalls).toBe(1);
  });
});
