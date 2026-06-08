// Self-improvement ledger (Phase 3) — an append-only, capped record of EVERY real
// generation's quality + repair effort over time. Distinct from the mass-test trend
// (which is per A/B run): this captures the owner's actual usage, so cumulative
// improvement ("Google-grade accretive excellence") is observable on real work, and it
// is the high-signal source the Phase-4 training export can mine.
//
// Mirrors error-fix-store.ts / exemplar-store.ts: a small capped JSON file under .rag,
// load/save with try/catch, injectable `dir` for tests. Strictly best-effort — recording
// a ledger entry can NEVER affect a generation.
import fs from "fs";
import path from "path";
import { atomicWriteFileSync } from "./atomic-write.js";

export interface LedgerEntry {
  /** ISO timestamp. */
  at: string;
  /** Phase-1 deterministic quality score 0..100 (0 if unscored). */
  score: number;
  /** "clean" | "repaired" | "failed". */
  source: string;
  /** Total repair actions: contract-fix + type-fix + Metro autofix attempts. */
  repairs: number;
  /** best-of-N used for this generation (1 = single sample). */
  bestOfN: number;
  buildSuccess: boolean;
}

const MAX_LEDGER = 1000;

const defaultDir = (): string => path.resolve(process.cwd(), ".rag");
const ledgerPath = (dir: string): string => path.join(dir, "ledger.json");

export const loadLedger = (dir: string = defaultDir()): LedgerEntry[] => {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(ledgerPath(dir), "utf-8"));
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is LedgerEntry =>
        !!e && typeof e === "object" && typeof (e as LedgerEntry).score === "number",
    );
  } catch {
    return [];
  }
};

/** Append a ledger entry, capped to the most-recent MAX_LEDGER. Never throws. */
export const recordLedgerEntry = (
  entry: Omit<LedgerEntry, "at">,
  opts: { dir?: string } = {},
): void => {
  const dir = opts.dir ?? defaultDir();
  try {
    const ledger = loadLedger(dir);
    ledger.push({ at: new Date().toISOString(), ...entry });
    const trimmed = ledger.slice(-MAX_LEDGER);
    atomicWriteFileSync(ledgerPath(dir), JSON.stringify(trimmed, null, 2));
  } catch {
    // Best-effort: a ledger write must never break the pipeline.
  }
};

export interface LedgerSummary {
  count: number;
  avgScore: number;
  /** Average score of the most recent `window` entries (the live trend). */
  recentAvgScore: number;
  successRate: number;
}

/**
 * Summarize the ledger for reporting: lifetime average vs the recent-window average so a
 * rising `recentAvgScore` over `avgScore` is the direct signal of accretive improvement.
 */
export const summarizeLedger = (
  dir: string = defaultDir(),
  window = 20,
): LedgerSummary => {
  const ledger = loadLedger(dir);
  if (ledger.length === 0) {
    return { count: 0, avgScore: 0, recentAvgScore: 0, successRate: 0 };
  }
  const mean = (xs: number[]): number =>
    xs.length === 0 ? 0 : Math.round(xs.reduce((s, v) => s + v, 0) / xs.length);
  const recent = ledger.slice(-window);
  return {
    count: ledger.length,
    avgScore: mean(ledger.map((e) => e.score)),
    recentAvgScore: mean(recent.map((e) => e.score)),
    successRate: Math.round((ledger.filter((e) => e.buildSuccess).length / ledger.length) * 100),
  };
};
