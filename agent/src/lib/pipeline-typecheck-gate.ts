// Anti-regression gate for the Metro autofix loop.
//
// Today the build loop applies an LLM SEARCH/REPLACE to clear a Metro bundler
// error and only re-waits for Metro to recompile; the authoritative `tsc`
// typecheck runs once AFTER the loop. So a "fix" that clears the bundler error
// but INTRODUCES a type error (or doesn't help) burns iterations and is only
// caught at the end. This module makes the loop MONOTONIC: after a fix is
// applied, if it makes the project typecheck WORSE than before, revert it.
//
// Everything here is additive and DI-driven so it can be unit-tested with fakes
// and so a failure (e.g. `runTypecheck` throwing) falls back to today's
// behavior — keep the fix, never throw, never break the loop.
import type { MetroError } from "./auto-fixer.js";
import type { SearchReplaceBlock } from "../schemas/search-replace.schema.js";
import { parseTypeErrors } from "./typecheck.js";

interface CommandResultLike {
  success: boolean;
  combinedOutput: string;
}

interface AutoFixResultLike {
  success: boolean;
  attempts: number;
  lastError?: string;
}

/** Minimal shape of the `autoFix` call the gate drives (DI seam). */
type AutoFixFn = (options: {
  projectName: string;
  error: MetroError;
  lmStudioUrl?: string;
  model?: string;
  complete?: import("../services/llm-proxy.js").CompleteFn;
  maxAttempts?: number;
  onAttempt?: (attempt: number, maxAttempts: number) => void;
  onFix?: (block: SearchReplaceBlock) => void;
}) => Promise<AutoFixResultLike>;

/**
 * Decide whether to KEEP a fix based on typecheck error counts taken before and
 * after applying it. Monotonic rule: a fix is acceptable only if it does not
 * INCREASE the number of type errors. Equal-or-fewer errors → keep; strictly
 * more → reject (regression).
 *
 * Pure and exported so the core decision is trivially unit-tested.
 */
export const shouldKeepFix = (beforeErrors: number, afterErrors: number): boolean =>
  afterErrors <= beforeErrors;

/** Count fixable-or-not type errors in raw `tsc` output (all diagnostics). */
export const countTypeErrors = (combinedOutput: string): number =>
  parseTypeErrors(combinedOutput).length;

export interface GatedAutofixDeps {
  autoFix: AutoFixFn;
  /** ctx.runTypecheck — authoritative typecheck. May be undefined/throw. */
  runTypecheck?: (projectPath: string) => Promise<CommandResultLike>;
  /** file-manager readFile bound to the project (path) => content|null. */
  readFile: (filePath: string) => string | null;
  /** file-manager writeFile bound to the project (path, content) => void. */
  writeFile: (filePath: string, content: string) => void;
  /** Emit a log/build line (same broadcast/emit the loop already uses). */
  emit?: (message: Record<string, unknown>) => void;
}

export interface GatedAutofixParams {
  projectName: string;
  projectPath: string;
  error: MetroError;
  lmStudioUrl?: string;
  model?: string;
  complete?: import("../services/llm-proxy.js").CompleteFn;
  /** Baseline type-error count captured BEFORE this autofix attempt. */
  baselineErrors: number;
  onAttempt?: (attempt: number, maxAttempts: number) => void;
  onFix?: (block: SearchReplaceBlock) => void;
}

export interface GatedAutofixResult {
  /** True if autoFix reported it applied a SEARCH/REPLACE block. */
  applied: boolean;
  /** True if an applied fix was reverted because it regressed the typecheck. */
  reverted: boolean;
  /** The autoFix result (success/attempts/lastError), passed through verbatim. */
  fixResult: AutoFixResultLike;
  /** The last block that was applied (for recordFix), or null. Null if reverted. */
  lastAppliedBlock: { filepath: string; replace: string } | null;
  /**
   * Post-fix type-error count when a typecheck ran, else null (no fix applied,
   * runTypecheck unavailable, or it threw — fallback to keeping the fix).
   */
  afterErrors: number | null;
}

/**
 * Apply one Metro autofix with a typecheck gate. Snapshots every file the fix
 * touches BEFORE writing, then — only if a fix was actually applied — runs the
 * authoritative typecheck and reverts the touched files if the fix introduced
 * new type errors (regression). Bounded (one extra typecheck per applied fix),
 * safe (never throws), and a no-op vs. today when no fix is applied.
 */
export const applyAutofixWithGate = async (
  deps: GatedAutofixDeps,
  params: GatedAutofixParams,
): Promise<GatedAutofixResult> => {
  const { autoFix, runTypecheck, readFile, writeFile, emit } = deps;
  const {
    projectName,
    projectPath,
    error,
    lmStudioUrl,
    model,
    complete,
    baselineErrors,
    onAttempt,
    onFix,
  } = params;

  // Snapshot each touched file's content the FIRST time the fix targets it, so a
  // revert restores exactly what existed before this attempt. autoFix invokes
  // onFix BEFORE it writes the file (see applyBlock), so the snapshot is pre-fix.
  const snapshots = new Map<string, string | null>();
  let lastAppliedBlock: { filepath: string; replace: string } | null = null;

  const fixResult = await autoFix({
    projectName,
    error,
    lmStudioUrl,
    model,
    complete,
    maxAttempts: 1,
    onAttempt,
    onFix: (block) => {
      if (block.filepath && !snapshots.has(block.filepath)) {
        let snapshot: string | null = null;
        try {
          snapshot = readFile(block.filepath);
        } catch {
          snapshot = null;
        }
        snapshots.set(block.filepath, snapshot);
      }
      lastAppliedBlock = { filepath: block.filepath, replace: block.replace ?? "" };
      onFix?.(block);
    },
  });

  const applied = fixResult.success;

  // No fix applied → nothing to gate. Identical to today's behavior.
  if (!applied) {
    return { applied: false, reverted: false, fixResult, lastAppliedBlock: null, afterErrors: null };
  }

  // runTypecheck unavailable → fall back to keeping the fix (additive & safe).
  if (!runTypecheck) {
    return { applied: true, reverted: false, fixResult, lastAppliedBlock, afterErrors: null };
  }

  let afterErrors: number | null = null;
  try {
    const typecheck = await runTypecheck(projectPath);
    afterErrors = typecheck.success ? 0 : countTypeErrors(typecheck.combinedOutput);
  } catch {
    // Typecheck threw → cannot judge regression → keep the fix (fallback).
    return { applied: true, reverted: false, fixResult, lastAppliedBlock, afterErrors: null };
  }

  if (shouldKeepFix(baselineErrors, afterErrors)) {
    return { applied: true, reverted: false, fixResult, lastAppliedBlock, afterErrors };
  }

  // Regression: revert every touched file to its pre-fix snapshot.
  for (const [filepath, original] of snapshots) {
    try {
      // A snapshot of null means the file did not exist before the fix; the
      // autofix only ever writes files that already existed (readFile guards in
      // applyBlock), so in practice originals are strings. Write back when we
      // have content; skip null (nothing safe to restore).
      if (original !== null) {
        writeFile(filepath, original);
      }
    } catch {
      // Best-effort revert; never throw out of the gate.
    }
  }

  emit?.({
    type: "build_event",
    eventType: "self_healing",
    message: `↩︎ Reverted autofix for ${error.file}: introduced ${afterErrors - baselineErrors} new type error(s) (${baselineErrors}→${afterErrors})`,
  });

  return { applied: false, reverted: true, fixResult, lastAppliedBlock: null, afterErrors };
};
