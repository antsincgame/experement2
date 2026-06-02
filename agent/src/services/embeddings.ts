// Local embeddings client for the semantic RAG index. Talks to the OpenAI-compatible
// LM Studio /v1/embeddings endpoint behind the same SSRF guard as the chat proxy.
// Every failure mode (no embedding model loaded, 404, network) resolves to null so
// the caller can fall back to the keyword RAG — semantic search is always optional.
import { assertLlmUrl } from "../lib/llm-url.js";
import { resolveEmbeddingModel } from "./embedding-model.js";

const DEFAULT_LM_STUDIO_URL = process.env.LM_STUDIO_URL?.trim() || "http://localhost:1234";
const EMBEDDING_TIMEOUT_MS = 30_000;

export interface EmbedOptions {
  url?: string;
  model?: string;
  timeoutMs?: number;
  /** Injectable for tests; defaults to global fetch. */
  fetchFn?: typeof fetch;
}

interface EmbeddingResponse {
  data?: { embedding?: number[] }[];
}

/**
 * Embed one or more texts. Returns a vector per input (same order), or null when
 * embeddings are unavailable for any reason. Never throws on a server/network fault.
 */
export const embedTexts = async (
  texts: string[],
  options: EmbedOptions = {}
): Promise<number[][] | null> => {
  if (texts.length === 0) return [];

  let baseUrl: string;
  try {
    baseUrl = assertLlmUrl(options.url ?? DEFAULT_LM_STUDIO_URL);
  } catch {
    return null;
  }

  const doFetch = options.fetchFn ?? fetch;
  const model = await resolveEmbeddingModel({
    url: baseUrl,
    explicitModel: options.model,
    fetchFn: doFetch,
  });
  if (!model) return null;
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? EMBEDDING_TIMEOUT_MS
  );

  try {
    const response = await doFetch(`${baseUrl}/v1/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, input: texts }),
      signal: controller.signal,
    });

    if (!response.ok) return null;

    const json = (await response.json()) as EmbeddingResponse;
    const rows = json.data;
    if (!Array.isArray(rows) || rows.length !== texts.length) return null;

    const vectors: number[][] = [];
    for (const row of rows) {
      const vector = row?.embedding;
      if (!Array.isArray(vector) || vector.length === 0) return null;
      vectors.push(vector);
    }
    return vectors;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
};

/** Embed a single text; null when unavailable. */
export const embedText = async (
  text: string,
  options: EmbedOptions = {}
): Promise<number[] | null> => {
  const vectors = await embedTexts([text], options);
  return vectors && vectors[0] ? vectors[0] : null;
};
