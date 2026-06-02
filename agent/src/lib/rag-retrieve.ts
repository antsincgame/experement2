// Retrieval entrypoint for code generation. Tries semantic search over the embedded
// RAG index; on any unavailability (no embedding model, embed failure, empty index)
// it falls back to the existing keyword RAG so behavior is unchanged without an
// embedder. The Tamagui core rules are always prepended as they are non-negotiable.
import { KNOWLEDGE_BASE, getRelevantDocs } from "../prompts/knowledge-base.js";
import { embedText, type EmbedOptions } from "../services/embeddings.js";
import { buildOrLoadIndex, type BuildIndexOptions } from "./rag-index.js";
import { searchTopK, type EmbeddedChunk } from "./vector-store.js";

const DEFAULT_TOP_K = 5;

export interface GenerationContextInput {
  path: string;
  type: string;
  description: string;
  dependencies: string[];
}

export interface GenerationContextResult {
  text: string;
  semantic: boolean;
}

export interface RetrieveDeps {
  loadIndex?: (options: BuildIndexOptions) => Promise<EmbeddedChunk[] | null>;
  embedQuery?: (text: string, options: EmbedOptions) => Promise<number[] | null>;
  keywordFallback?: (description: string, dependencies: string[]) => string;
}

export interface GenerationContextOptions {
  /** When false, skip semantic search and use keyword RAG only. Default: true. */
  semanticRagEnabled?: boolean;
  embedOptions?: EmbedOptions;
  cacheDir?: string;
  topK?: number;
  deps?: RetrieveDeps;
}

const buildQuery = (input: GenerationContextInput): string =>
  `${input.type} ${input.path}\n${input.description}\ndependencies: ${input.dependencies.join(", ")}`;

/**
 * Resolve the RAG context for a single file. Returns the keyword result (semantic:false)
 * whenever the embedder/index is unavailable, and a semantic top-k context otherwise.
 */
export const getGenerationContext = async (
  input: GenerationContextInput,
  options: GenerationContextOptions = {}
): Promise<GenerationContextResult> => {
  const deps = options.deps ?? {};
  const keywordFallback = deps.keywordFallback ?? getRelevantDocs;
  const fallback = (): GenerationContextResult => ({
    text: keywordFallback(input.description, input.dependencies),
    semantic: false,
  });

  if (options.semanticRagEnabled === false) {
    return fallback();
  }

  const loadIndex = deps.loadIndex ?? buildOrLoadIndex;
  const embedQuery = deps.embedQuery ?? embedText;

  let index: EmbeddedChunk[] | null;
  try {
    index = await loadIndex({
      embedOptions: options.embedOptions,
      cacheDir: options.cacheDir,
    });
  } catch {
    index = null;
  }
  if (!index || index.length === 0) return fallback();

  let queryVector: number[] | null;
  try {
    queryVector = await embedQuery(buildQuery(input), options.embedOptions ?? {});
  } catch {
    queryVector = null;
  }
  if (!queryVector) return fallback();

  const top = searchTopK(index, queryVector, options.topK ?? DEFAULT_TOP_K);
  if (top.length === 0) return fallback();

  // Tamagui core rules are mandatory; prepend and de-duplicate against retrieved text.
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const text of [KNOWLEDGE_BASE.tamaguiCore, ...top.map((c) => c.text)]) {
    const key = text.trim();
    if (seen.has(key)) continue;
    seen.add(key);
    parts.push(text);
  }

  return { text: parts.join("\n\n"), semantic: true };
};
