// Persists error -> fix pairs captured from successful autofixes so the semantic RAG
// can surface "last time this error appeared, here is what fixed it". Stored as a
// small JSON file under the agent's .rag directory; capped and deduped by signature.
import fs from "fs";
import path from "path";

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
  } catch {
    return [];
  }
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
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(storePath(dir), JSON.stringify(trimmed, null, 2), "utf-8");
  } catch {
    // Best-effort: a failed write must never break the build/autofix loop.
  }
};
