// Test-time compute: best-of-N candidate generation + verifier reranking (Phase 2).
// Draws N candidates for ONE file (temperature-spread for diversity), scores each with a
// DI reranker (cheap deterministic signals first — extractable code, contract violations,
// content heuristics — judge optional), and returns the winner's raw text. Pure + DI:
// N<=1 is a single completion (the generator keeps its byte-identical streaming path for
// N=1; this engine is only invoked for N>1). Sequential by design so it respects the
// llm-proxy MAX_CONCURRENT_LLM_REQUESTS guard. Never throws (a failed sample = unusable).
import { type CompleteFn } from "../services/llm-proxy.js";
import { collectStream } from "./stream-collect.js";

type GenMessages = Parameters<CompleteFn>[0];
type GenOptions = NonNullable<Parameters<CompleteFn>[1]>;

export interface BestCandidate {
  /** Raw model response. */
  text: string;
  /** Extracted code, or null if extraction failed (unusable candidate). */
  code: string | null;
  /** Reranker score; -1 marks an unusable candidate. */
  score: number;
}

/** Spread N temperatures around `base` so candidates are diverse (deterministic→creative). */
export const spreadTemperatures = (base: number, n: number): number[] => {
  if (n <= 1) return [base];
  const lo = Math.max(0, base - 0.2);
  const hi = Math.min(1.2, base + 0.2);
  return Array.from({ length: n }, (_, i) =>
    Number((lo + ((hi - lo) * i) / (n - 1)).toFixed(2)),
  );
};

export const generateBestCandidate = async (params: {
  n: number;
  messages: GenMessages;
  options: GenOptions;
  complete: CompleteFn;
  /** Extract code from a raw response (e.g. extractCodeFromResponse). */
  extract: (text: string) => string | null;
  /** Higher = better. Cheap-to-expensive cascade lives inside this closure. */
  scoreCandidate: (code: string) => number;
}): Promise<{ winnerText: string; scores: number[]; candidates: BestCandidate[] }> => {
  const { n, messages, options, complete, extract, scoreCandidate } = params;
  const temps = spreadTemperatures(options.temperature ?? 0.4, Math.max(1, n));

  const candidates: BestCandidate[] = [];
  for (const temperature of temps) {
    try {
      const gen = await complete(messages, { ...options, temperature });
      const text = await collectStream(gen);
      const code = extract(text);
      const score = code ? scoreCandidate(code) : -1;
      candidates.push({ text, code, score });
    } catch {
      candidates.push({ text: "", code: null, score: -1 });
    }
  }

  // Prefer usable candidates (extractable code); fall back to the first response otherwise
  // so best-of-N is never worse than a single sample.
  const usable = candidates.filter((c) => c.code !== null);
  const pool = usable.length > 0 ? usable : candidates;
  const winner = pool.reduce((best, c) => (c.score > best.score ? c : best), pool[0]);

  return {
    winnerText: winner?.text ?? "",
    scores: candidates.map((c) => c.score),
    candidates,
  };
};
