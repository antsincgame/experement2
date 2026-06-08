// Persists error -> fix pairs captured from successful autofixes so the semantic RAG
// can surface "last time this error appeared, here is what fixed it". Stored as a
// small JSON file under the agent's .rag directory; capped and deduped by signature.
import fs from "fs";
import path from "path";
import { atomicWriteFileSync } from "./atomic-write.js";
import { warnCaught } from "./catch-log.js";

export interface RagFixRecord {
  errorSignature: string;
  file: string;
  fixSummary: string;
  timestamp: number;
}

const MAX_FIX_RECORDS = 200;

const defaultDir = (): string => path.resolve(process.cwd(), ".rag");
const storePath = (dir: string): string => path.join(dir, "error-fixes.json");

/**
 * Collapse a raw compiler/Metro error into a stable signature: drop absolute
 * paths, line/column numbers, and quoted literals so the same class of error
 * matches regardless of where it occurred.
 */
export const normalizeErrorSignature = (raw: string): string =>
  raw
    .replace(/[A-Za-z]:[\\/][^\s:]+/g, "<path>")
    .replace(/\(\d+,\d+\)/g, "")
    .replace(/:\d+:\d+/g, "")
    .replace(/['"`][^'"`]*['"`]/g, "<literal>")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 400);

export const loadFixes = (dir: string = defaultDir()): RagFixRecord[] => {
  try {
    const raw = fs.readFileSync(storePath(dir), "utf-8");
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is RagFixRecord =>
        !!entry &&
        typeof entry === "object" &&
        typeof (entry as RagFixRecord).errorSignature === "string" &&
        typeof (entry as RagFixRecord).fixSummary === "string"
    );
  } catch (error) {
    warnCaught("error-fix-store", error, "load error-fix records");
    return [];
  }
};

/** Tokens too short or too generic to discriminate one error class from another. */
const STOP_TOKENS = new Set([
  "error",
  "type",
  "the",
  "and",
  "for",
  "not",
  "does",
  "with",
  "from",
  "<path>",
  "<literal>",
]);

const tokenize = (signature: string): string[] =>
  signature
    .toLowerCase()
    .split(/[^a-z0-9<>]+/)
    .filter((t) => t.length > 2 && !STOP_TOKENS.has(t));

/**
 * Cheap Jaccard-style overlap between two signatures' discriminating tokens.
 * Returns 0..1; 0 when either side has no usable tokens.
 */
const overlapScore = (a: string[], bSet: Set<string>): number => {
  if (a.length === 0 || bSet.size === 0) return 0;
  let shared = 0;
  for (const token of new Set(a)) {
    if (bSet.has(token)) shared += 1;
  }
  const union = new Set([...a, ...bSet]).size;
  return union === 0 ? 0 : shared / union;
};

/**
 * Retrieve past recorded fixes whose error signature resembles `errorText`.
 * Exact normalized-signature matches rank first; otherwise records are scored by
 * cheap token overlap and the strongest are returned. Pure and unit-testable:
 * reads the same store `recordFix` writes to (override `dir` in tests). Never
 * throws — a missing/corrupt store yields []. Caps `limit` to 2 (top-1 is best;
 * piling on more exemplars degrades small-model repair quality).
 */
export const findSimilarFixes = (
  errorText: string,
  opts: { limit?: number; file?: string; dir?: string } = {}
): RagFixRecord[] => {
  try {
    const limit = Math.max(1, Math.min(opts.limit ?? 1, 2));
    const signature = normalizeErrorSignature(errorText ?? "");
    if (!signature) return [];

    const fixes = loadFixes(opts.dir ?? defaultDir());
    if (fixes.length === 0) return [];

    const queryTokens = tokenize(signature);

    const scored = fixes
      .map((fix) => {
        const exact = fix.errorSignature === signature ? 1 : 0;
        const overlap = overlapScore(queryTokens, new Set(tokenize(fix.errorSignature)));
        // Exact matches dominate; same-file fixes break ties slightly.
        const fileBonus = opts.file && fix.file === opts.file ? 0.01 : 0;
        return { fix, score: exact * 10 + overlap + fileBonus, exact, overlap };
      })
      // Keep only meaningful candidates: an exact signature or real token overlap.
      .filter((s) => s.exact === 1 || s.overlap > 0)
      .sort((a, b) => b.score - a.score || b.fix.timestamp - a.fix.timestamp);

    return scored.slice(0, limit).map((s) => s.fix);
  } catch (error) {
    warnCaught("error-fix-store", error, "find similar fixes");
    return [];
  }
};

/**
 * Render retrieved fixes into a compact, clearly-labelled prompt block, or ""
 * when there is nothing to inject (so callers add no empty section). Each
 * fixSummary is truncated so a couple of exemplars can never blow the budget.
 */
export const buildPastFixBlock = (fixes: RagFixRecord[]): string => {
  if (fixes.length === 0) return "";
  const body = fixes
    .map(
      (fix) =>
        `ERROR: ${fix.errorSignature}\nFIX (${fix.file}): ${fix.fixSummary.slice(0, 300)}`
    )
    .join("\n");
  return `## PAST FIX FOR A SIMILAR ERROR (apply the same approach)\n${body}`;
};

/**
 * Record a successful fix. Deduped by error signature (latest wins) and capped to
 * the most recent MAX_FIX_RECORDS. Never throws — persistence is best-effort.
 */
export const recordFix = (
  record: { errorSignature: string; file: string; fixSummary: string },
  dir: string = defaultDir()
): void => {
  const signature = normalizeErrorSignature(record.errorSignature);
  if (!signature || !record.fixSummary.trim()) return;

  try {
    const existing = loadFixes(dir).filter(
      (entry) => entry.errorSignature !== signature
    );
    existing.push({
      errorSignature: signature,
      file: record.file,
      fixSummary: record.fixSummary.trim().slice(0, 600),
      timestamp: Date.now(),
    });
    const trimmed = existing.slice(-MAX_FIX_RECORDS);
    atomicWriteFileSync(storePath(dir), JSON.stringify(trimmed, null, 2));
  } catch (error) {
    warnCaught("error-fix-store", error, "record fix");
  }
};
