// Learns few-shot exemplars from the USER'S OWN clean generations (win-rate lever #4,
// path B). When a project builds successfully WITHOUT any repair (zero autofix /
// contract-fix / type-fix), every file in it is known first-pass-correct, so a few
// representative files are captured here as TEACHING MATERIAL. A learned real example
// from the user's own domain is preferred over the curated golden one (see
// golden-examples.ts: selectExemplar).
//
// SAFETY: only genuinely-good (clean-build, zero-repair) files are ever recorded — see
// the strict capture gate in pipeline-codegen-phase.ts. Capturing mediocre self-output
// would teach the model from its own drift, so the gate is conservative and capture is
// always best-effort (never throws, never affects the generation result).
//
// Mirrors error-fix-store.ts's persistence pattern: a small capped JSON file under the
// agent's .rag directory, load/save with try/catch, and an injectable `dir` for tests.
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { warnCaught } from "./catch-log.js";

export interface ExemplarRecord {
  /** The file `type` this exemplar teaches (screen / store / component / ...). */
  type: string;
  /** The plan description that produced this file (drives retrieval relevance). */
  description: string;
  /** The complete, first-pass-correct file code (trimmed — see caps below). */
  code: string;
  /** Content hash for dedup. */
  hash: string;
  timestamp: number;
  /** Phase-1 quality score 0..100 at capture (legacy records ⇒ 0). Ranks + evicts. */
  score?: number;
  /** Provenance: "clean" (zero-repair, tier-1) | "repaired" | "polished" (high-score after fix). */
  source?: "clean" | "repaired" | "polished";
}

/** Keep at most this many exemplars PER type (most-recent win; oldest dropped). */
const MAX_PER_TYPE = 8;
/** Hard line cap so a captured file can never blow the prompt budget. */
const MAX_CODE_LINES = 120;
/** Hard char cap (defense-in-depth alongside the line cap). */
const MAX_CODE_CHARS = 6000;

const defaultDir = (): string => path.resolve(process.cwd(), ".rag");
const storePath = (dir: string): string => path.join(dir, "exemplars.json");

const hashCode = (code: string): string =>
  crypto.createHash("sha1").update(code).digest("hex");

/** Trim captured code to the line + char caps without breaking mid-line. */
const trimCode = (code: string): string => {
  const lines = code.split("\n");
  const capped =
    lines.length > MAX_CODE_LINES ? lines.slice(0, MAX_CODE_LINES).join("\n") : code;
  return capped.length > MAX_CODE_CHARS ? capped.slice(0, MAX_CODE_CHARS) : capped;
};

export const loadExemplars = (dir: string = defaultDir()): ExemplarRecord[] => {
  try {
    const raw = fs.readFileSync(storePath(dir), "utf-8");
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is ExemplarRecord =>
        !!entry &&
        typeof entry === "object" &&
        typeof (entry as ExemplarRecord).type === "string" &&
        typeof (entry as ExemplarRecord).description === "string" &&
        typeof (entry as ExemplarRecord).code === "string"
    );
  } catch (error) {
    warnCaught("exemplar-store", error, "load exemplars");
    return [];
  }
};

/** Tokens too short or too generic to discriminate one file's purpose from another. */
const STOP_TOKENS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "screen",
  "store",
  "component",
  "this",
  "that",
  "app",
  "page",
  "view",
]);

const tokenize = (text: string): string[] =>
  text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2 && !STOP_TOKENS.has(t));

/**
 * Cheap Jaccard-style overlap between two descriptions' discriminating tokens.
 * Returns 0..1; 0 when either side has no usable tokens. Same shape as
 * error-fix-store's overlapScore.
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
 * Record a clean-generation exemplar. Code is trimmed to the caps, deduped by content
 * hash, and the store is capped to MAX_PER_TYPE most-recent records PER type (oldest
 * dropped). Never throws — persistence is strictly best-effort, and capturing a bad
 * file must never affect the generation result.
 */
export const recordExemplar = (
  record: { type: string; description: string; code: string; score?: number; source?: ExemplarRecord["source"] },
  opts: { dir?: string } = {}
): void => {
  const dir = opts.dir ?? defaultDir();
  const type = (record.type ?? "").toLowerCase().trim();
  const code = trimCode((record.code ?? "").trim());
  const description = (record.description ?? "").trim();
  if (!type || !code) return;

  try {
    const hash = hashCode(code);
    const existing = loadExemplars(dir);

    // Dedup by content hash — re-capturing the same file is a no-op.
    if (existing.some((e) => e.hash === hash)) return;

    existing.push({
      type,
      description,
      code,
      hash,
      timestamp: Date.now(),
      score: record.score ?? 0,
      source: record.source ?? "clean",
    });

    // Cap PER type: keep the MAX_PER_TYPE HIGHEST-QUALITY of each type (recency breaks
    // ties), dropping the lowest-score. This structurally prevents drift — a low-quality
    // capture can never displace a high-quality one (Phase 3 accretive memory).
    const byType = new Map<string, ExemplarRecord[]>();
    for (const entry of existing) {
      const list = byType.get(entry.type) ?? [];
      list.push(entry);
      byType.set(entry.type, list);
    }
    const trimmed: ExemplarRecord[] = [];
    for (const list of byType.values()) {
      list.sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || b.timestamp - a.timestamp);
      trimmed.push(...list.slice(0, MAX_PER_TYPE));
    }

    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(storePath(dir), JSON.stringify(trimmed, null, 2), "utf-8");
  } catch (error) {
    warnCaught("exemplar-store", error, "record exemplar");
  }
};

/**
 * Find the single best LEARNED exemplar for a file, or null when nothing relevant was
 * captured. Filters by `type`, ranks the candidates by description token-overlap
 * (most-recent breaks ties), and returns the TOP-1 code only (research says one
 * exemplar; piling on more degrades small-model quality). Never throws — a
 * missing/corrupt store yields null so the caller can fall back to the golden example.
 */
export const findBestExemplar = (
  file: { type: string; description: string },
  opts: { dir?: string } = {}
): string | null => {
  try {
    const type = (file.type ?? "").toLowerCase().trim();
    if (!type) return null;

    const exemplars = loadExemplars(opts.dir ?? defaultDir()).filter(
      (e) => e.type === type
    );
    if (exemplars.length === 0) return null;

    const queryTokens = tokenize(file.description ?? "");

    // Combine relevance (description overlap) with QUALITY: a higher-score exemplar wins
    // among close matches, and when the description signal is weak (no overlap) the
    // highest-quality same-type example is returned instead of merely the most recent.
    const qualityWeight = (q: number): number =>
      0.4 + 0.6 * (Math.max(0, Math.min(100, q)) / 100); // 0.4..1.0
    const scored = exemplars
      // `index` preserves storage order so ties break toward the most-recent record
      // even when two were captured in the same millisecond (timestamps can collide).
      .map((exemplar, index) => {
        const overlap = overlapScore(queryTokens, new Set(tokenize(exemplar.description)));
        const quality = exemplar.score ?? 0;
        return {
          exemplar,
          index,
          quality,
          // overlap alone can be 0 for many; the +small quality term breaks those ties
          // toward the best exemplar rather than the newest.
          final: overlap * qualityWeight(quality) + quality / 100000,
        };
      })
      .sort(
        (a, b) =>
          b.final - a.final ||
          b.quality - a.quality ||
          b.exemplar.timestamp - a.exemplar.timestamp ||
          b.index - a.index
      );

    return scored[0]?.exemplar.code ?? null;
  } catch (error) {
    warnCaught("exemplar-store", error, "find best exemplar");
    return null;
  }
};
