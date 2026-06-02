// Assembles the semantic RAG corpus from three sources into a flat list of chunks:
//   docs     - the hand-written KNOWLEDGE_BASE, split per numbered rule for granularity
//   errors   - persisted error -> fix pairs from past autofixes
//   examples - one-line summaries of files from previously generated projects
// Pure assembly: callers pass in the fix records and example summaries (gathered
// elsewhere) so this module stays trivially testable.
import { createHash } from "node:crypto";
import { KNOWLEDGE_BASE } from "../prompts/knowledge-base.js";
import type { RagFixRecord } from "./error-fix-store.js";
import type { RagChunk } from "./vector-store.js";

export interface ExampleSummary {
  project: string;
  path: string;
  type: string;
  description: string;
  exportSignature: string;
}

/** Split one KNOWLEDGE_BASE entry into heading-prefixed chunks, one per numbered rule. */
const splitDoc = (key: string, doc: string): RagChunk[] => {
  const lines = doc.split("\n");
  const heading = lines[0]?.trim() ?? key;
  const chunks: RagChunk[] = [];
  let current: string[] = [];
  let index = 0;

  const flush = (): void => {
    const body = current.join("\n").trim();
    if (body) {
      chunks.push({
        id: `docs:${key}:${index}`,
        text: `${heading}\n${body}`,
        source: "docs",
      });
      index += 1;
    }
    current = [];
  };

  for (const line of lines.slice(1)) {
    if (/^\d+\./.test(line.trim()) && current.length > 0) {
      flush();
    }
    current.push(line);
  }
  flush();

  // A doc with no numbered rules still yields one whole-doc chunk.
  if (chunks.length === 0) {
    chunks.push({ id: `docs:${key}:0`, text: doc.trim(), source: "docs" });
  }
  return chunks;
};

export const buildDocChunks = (): RagChunk[] =>
  Object.entries(KNOWLEDGE_BASE).flatMap(([key, doc]) => splitDoc(key, doc));

export const fixesToChunks = (fixes: RagFixRecord[]): RagChunk[] =>
  fixes.map((fix, i) => ({
    id: `errors:${i}`,
    text: `## PAST FIX\nERROR: ${fix.errorSignature}\nFIX (${fix.file}): ${fix.fixSummary}`,
    source: "errors" as const,
  }));

export const examplesToChunks = (examples: ExampleSummary[]): RagChunk[] =>
  examples.map((ex, i) => ({
    id: `examples:${ex.project}:${i}`,
    text: `## EXAMPLE FILE (${ex.type})\n${ex.path}: ${ex.description}\nExports: ${ex.exportSignature}`,
    source: "examples" as const,
  }));

/** Assemble the full corpus. Docs are always present; errors/examples are optional. */
export const assembleCorpus = (input: {
  fixes?: RagFixRecord[];
  examples?: ExampleSummary[];
}): RagChunk[] => [
  ...buildDocChunks(),
  ...fixesToChunks(input.fixes ?? []),
  ...examplesToChunks(input.examples ?? []),
];

/** Stable hash of corpus identity (ids + text), used to invalidate the embedding cache. */
export const corpusHash = (chunks: RagChunk[]): string => {
  const hash = createHash("sha256");
  for (const chunk of chunks) {
    hash.update(chunk.id);
    hash.update("\u0000");
    hash.update(chunk.text);
    hash.update("\u0001");
  }
  return hash.digest("hex");
};
