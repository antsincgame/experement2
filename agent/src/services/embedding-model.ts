// Resolves which LM Studio model to use for /v1/embeddings. Priority: explicit
// override (settings) -> EMBEDDING_MODEL env -> auto-pick from /v1/models by name.
// Cached per base URL so generation does not hammer the models endpoint.
import { assertLlmUrl, llmFetch } from "../lib/llm-url.js";
import { warnCaught } from "../lib/catch-log.js";

const DEFAULT_LM_STUDIO_URL = process.env.LM_STUDIO_URL?.trim() || "http://localhost:1234";
const ENV_EMBEDDING_MODEL = process.env.EMBEDDING_MODEL?.trim() || "";

/** Names that strongly indicate an embedding model (not chat). */
const EMBEDDING_HINT =
  /(?:^|[/_-])(?:embed(?:ding)?|nomic-embed|bge-|e5-|sentence-|text-embedding|minilm)/i;

/** Chat-only names we should not pick when scanning the models list. */
const CHAT_ONLY_HINT =
  /(?:llama|qwen|mistral|gemma|phi|deepseek|codex|instruct|chat|vision)/i;

const PREFERRED_ORDER = [
  "nomic-embed",
  "text-embedding",
  "bge-",
  "e5-",
  "embed",
  "minilm",
];

interface CachedEntry {
  modelId: string | null;
  expiresAt: number;
}

const SUCCESS_TTL_MS = 5 * 60_000;
const FAIL_TTL_MS = 30_000;
const cache = new Map<string, CachedEntry>();
const inflight = new Map<string, Promise<string | null>>();

const scoreModelId = (id: string): number => {
  const lower = id.toLowerCase();
  if (!EMBEDDING_HINT.test(lower)) return -1;
  if (CHAT_ONLY_HINT.test(lower) && !EMBEDDING_HINT.test(lower)) return -1;
  for (let i = 0; i < PREFERRED_ORDER.length; i++) {
    if (lower.includes(PREFERRED_ORDER[i])) {
      return PREFERRED_ORDER.length - i;
    }
  }
  return 1;
};

const pickFromList = (ids: string[]): string | null => {
  let best: string | null = null;
  let bestScore = -1;
  for (const id of ids) {
    const score = scoreModelId(id);
    if (score > bestScore) {
      bestScore = score;
      best = id;
    }
  }
  return best;
};

const fetchModelIds = async (
  baseUrl: string,
  fetchFn: typeof fetch
): Promise<string[]> => {
  const response = await fetchFn(`${baseUrl}/v1/models`);
  if (!response.ok) return [];
  const json = (await response.json()) as { data?: { id?: string }[] };
  const rows = json.data ?? [];
  return rows.map((row) => row?.id).filter((id): id is string => typeof id === "string");
};

const resolveFromServer = async (
  baseUrl: string,
  fetchFn: typeof fetch
): Promise<string | null> => {
  const ids = await fetchModelIds(baseUrl, fetchFn);
  return pickFromList(ids);
};

const getCached = (baseUrl: string): string | null | undefined => {
  const entry = cache.get(baseUrl);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(baseUrl);
    return undefined;
  }
  return entry.modelId;
};

const setCached = (baseUrl: string, modelId: string | null, ttlMs: number): void => {
  cache.set(baseUrl, { modelId, expiresAt: Date.now() + ttlMs });
};

/** Drop cached resolution (tests or LM Studio URL change). */
export const clearEmbeddingModelCache = (baseUrl?: string): void => {
  if (baseUrl) {
    cache.delete(baseUrl);
    inflight.delete(baseUrl);
    return;
  }
  cache.clear();
  inflight.clear();
};

export interface ResolveEmbeddingModelOptions {
  url?: string;
  explicitModel?: string;
  fetchFn?: typeof fetch;
}

/**
 * Resolve the embedding model id to use. Returns null when nothing suitable is
 * available — callers should fall back to keyword RAG.
 */
export const resolveEmbeddingModel = async (
  options: ResolveEmbeddingModelOptions = {}
): Promise<string | null> => {
  const explicit = (options.explicitModel ?? "").trim();
  if (explicit) return explicit;
  if (ENV_EMBEDDING_MODEL) return ENV_EMBEDDING_MODEL;

  let baseUrl: string;
  try {
    baseUrl = assertLlmUrl(options.url ?? DEFAULT_LM_STUDIO_URL);
  } catch (error) {
    warnCaught("embedding-model", error, "assert LLM URL for embedding model");
    return null;
  }

  const cached = getCached(baseUrl);
  if (cached !== undefined) return cached;

  const existing = inflight.get(baseUrl);
  if (existing) return existing;

  const fetchFn = options.fetchFn ?? llmFetch;
  const promise = (async () => {
    try {
      const resolved = await resolveFromServer(baseUrl, fetchFn);
      setCached(baseUrl, resolved, resolved ? SUCCESS_TTL_MS : FAIL_TTL_MS);
      return resolved;
    } catch (error) {
      warnCaught("embedding-model", error, "resolve embedding model from server");
      setCached(baseUrl, null, FAIL_TTL_MS);
      return null;
    } finally {
      inflight.delete(baseUrl);
    }
  })();

  inflight.set(baseUrl, promise);
  return promise;
};
