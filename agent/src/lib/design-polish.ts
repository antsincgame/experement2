// Pure, dependency-injected orchestration for the opt-in "Auto-polish" design loop.
import { warnCaught } from "./catch-log.js";
// After a project builds, this asks the model to improve each screen's visual design
// over a few bounded passes, accepting a change ONLY if the project still validates
// (typecheck) — otherwise the file is reverted (anti-regression). The side effects
// (model call, validation, file IO, progress) are injected so the loop is testable
// without mocks (mirrors the PipelineContext / CompleteFn injection style).

/** The side-effecting boundary runDesignPolish depends on. */
export interface DesignPolishDeps {
  /** Return improved file content for a screen, or null if already good / no change. */
  critique: (file: { path: string; content: string }) => Promise<string | null>;
  /** e.g. typecheck — true if the project is still valid after a write. */
  validate: () => Promise<boolean>;
  writeFile: (path: string, content: string) => void;
  readFile: (path: string) => string | null;
  emit: (pass: number, maxPasses: number, message: string) => void;
}

export interface DesignPolishResult {
  passes: number;
  changed: number;
}

const MIN_PASSES = 1;
const MAX_PASSES = 4;

/** Clamp the requested pass count into the sane [1, 4] range. */
const clampMaxPasses = (maxPasses: number): number => {
  if (!Number.isFinite(maxPasses)) return MIN_PASSES;
  return Math.min(MAX_PASSES, Math.max(MIN_PASSES, Math.floor(maxPasses)));
};

/**
 * Run up to `maxPasses` refinement passes over the given screen files.
 *
 * For each pass: emit progress, then for each screen read its current content and
 * ask `critique` for an improvement. If critique returns new content, write it and
 * `await validate()`. If valid, keep it (counts as a change); if NOT valid, REVERT
 * to the previous content and move on. If a whole pass accepts zero changes the loop
 * stops early (converged). Per-file work is wrapped so one failure never aborts the
 * rest, and the loop never throws.
 */
export const runDesignPolish = async (
  screenPaths: string[],
  maxPasses: number,
  deps: DesignPolishDeps
): Promise<DesignPolishResult> => {
  const { critique, validate, writeFile, readFile, emit } = deps;
  const passLimit = clampMaxPasses(maxPasses);

  let passesRun = 0;
  let totalChanged = 0;

  for (let pass = 1; pass <= passLimit; pass++) {
    passesRun = pass;
    emit(pass, passLimit, `Polishing design (pass ${pass}/${passLimit})`);

    let changedThisPass = 0;

    for (const path of screenPaths) {
      try {
        const current = readFile(path);
        if (current === null) continue;

        const improved = await critique({ path, content: current });
        // null / unchanged / empty → no proposed change.
        if (improved === null || improved.trim() === "" || improved === current) {
          continue;
        }

        writeFile(path, improved);

        const stillValid = await validate();
        if (stillValid) {
          changedThisPass++;
          totalChanged++;
        } else {
          // Anti-regression: the change broke validation — restore the original.
          writeFile(path, current);
        }
      } catch (error) {
        warnCaught("design-polish", error, `polish screen ${path}`);
      }
    }

    // Converged: a full pass with no accepted change → further passes won't help.
    if (changedThisPass === 0) {
      break;
    }
  }

  return { passes: passesRun, changed: totalChanged };
};
