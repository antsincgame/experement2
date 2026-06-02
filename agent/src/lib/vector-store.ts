// In-memory vector store: cosine similarity over a small set of embedded chunks.
// Pure and dependency-free — the corpus (docs + error-fixes + examples) is tiny
// enough that a linear scan is faster and simpler than any external index.

export type RagSource = "docs" | "errors" | "examples";

export interface RagChunk {
  id: string;
  text: string;
  source: RagSource;
}

export interface EmbeddedChunk extends RagChunk {
  vector: number[];
}

export interface ScoredChunk extends EmbeddedChunk {
  score: number;
}

/** Cosine similarity of two equal-length vectors; 0 when either is degenerate. */
export const cosineSimilarity = (a: number[], b: number[]): number => {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
};

/**
 * Return the top-k chunks most similar to the query vector, highest score first.
 * Chunks whose vector dimensionality does not match the query are skipped (a mixed
 * index from different embedding models cannot be compared meaningfully).
 */
export const searchTopK = (
  chunks: EmbeddedChunk[],
  queryVector: number[],
  k: number
): ScoredChunk[] => {
  if (k <= 0 || chunks.length === 0 || queryVector.length === 0) return [];

  const scored: ScoredChunk[] = [];
  for (const chunk of chunks) {
    if (chunk.vector.length !== queryVector.length) continue;
    scored.push({ ...chunk, score: cosineSimilarity(chunk.vector, queryVector) });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k);
};
