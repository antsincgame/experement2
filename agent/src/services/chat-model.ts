// Picks a chat/completion model from LM Studio /v1/models, skipping embedding-only ids.
// Used by llm-proxy when no explicit model is set (enhance, auto generation, etc.).
import { assertLlmUrl, llmFetch } from "../lib/llm-url.js";
import { warnCaught } from "../lib/catch-log.js";

const DEFAULT_LM_STUDIO_URL = process.env.LM_STUDIO_URL?.trim() || "http://localhost:1234";
const ENV_CHAT_MODEL = process.env.CHAT_MODEL?.trim() || "";

/** Names that indicate an embedding model — not valid for /v1/chat/completions. */
const EMBEDDING_HINT =
  /(?:^|[/_-])(?:embed(?:ding)?|nomic-embed|bge-|e5-|sentence-|text-embedding|minilm)/i;

const CHAT_PREFERRED = [
  "instruct",
  "coder",
  "chat",
  "llama",
  "qwen",
  "mistral",
  "gemma",
  "deepseek",
  "phi",
  "vision",
  "gpt",
];

const scoreChatModelId = (id: string): number => {
  const lower = id.toLowerCase();
  if (EMBEDDING_HINT.test(lower)) {
    return -1;
  }
  let score = 1;
  for (let i = 0; i < CHAT_PREFERRED.length; i++) {
    if (lower.includes(CHAT_PREFERRED[i])) {
      score = Math.max(score, CHAT_PREFERRED.length - i + 1);
    }
  }
  return score;
};

/** Pure picker — exported for unit tests. */
export const pickChatModelFromIds = (ids: string[]): string | null => {
  if (ids.length === 0) {
    return null;
  }

  let best: string | null = null;
  let bestScore = -1;
  for (const id of ids) {
    const score = scoreChatModelId(id);
    if (score > bestScore) {
      bestScore = score;
      best = id;
    }
  }
  if (best) {
    return best;
  }

  const nonEmbed = ids.find((id) => !EMBEDDING_HINT.test(id.toLowerCase()));
  return nonEmbed ?? ids[0] ?? null;
};

interface CachedEntry {
  modelId: string | null;
  expiresAt: number;
}

const SUCCESS_TTL_MS = 5 * 60_000;
const FAIL_TTL_MS = 30_000;
const cache = new Map<string, CachedEntry>();
const inflight = new Map<string, Promise<string | null>>();

const fetchModelIds = async (
  baseUrl: string,
  fetchFn: typeof fetch
): Promise<string[]> => {
  const response = await fetchFn(`${baseUrl}/v1/models`);
  if (!response.ok) {
    return [];
  }
  const json = (await response.json()) as { data?: { id?: string }[] };
  const rows = json.data ?? [];
  return rows.map((row) => row?.id).filter((id): id is string => typeof id === "string");
};

export const clearChatModelCache = (baseUrl?: string): void => {
  if (baseUrl) {
    cache.delete(baseUrl);
    inflight.delete(baseUrl);
    return;
  }
  cache.clear();
  inflight.clear();
};

export interface ResolveChatModelOptions {
  url?: string;
  explicitModel?: string;
  fetchFn?: typeof fetch;
}

export const resolveChatModel = async (
  options: ResolveChatModelOptions = {}
): Promise<string | null> => {
  const explicit = (options.explicitModel ?? "").trim();
  if (explicit) {
    return explicit;
  }
  if (ENV_CHAT_MODEL) {
    return ENV_CHAT_MODEL;
  }

  let baseUrl: string;
  try {
    baseUrl = assertLlmUrl(options.url ?? DEFAULT_LM_STUDIO_URL);
  } catch (error) {
    warnCaught("chat-model", error, "assert LLM URL for chat model");
    return null;
  }

  const entry = cache.get(baseUrl);
  if (entry && entry.expiresAt > Date.now()) {
    return entry.modelId;
  }

  const existing = inflight.get(baseUrl);
  if (existing) {
    return existing;
  }

  const fetchFn = options.fetchFn ?? llmFetch;
  const promise = (async () => {
    try {
      const ids = await fetchModelIds(baseUrl, fetchFn);
      const resolved = pickChatModelFromIds(ids);
      cache.set(baseUrl, {
        modelId: resolved,
        expiresAt: Date.now() + (resolved ? SUCCESS_TTL_MS : FAIL_TTL_MS),
      });
      return resolved;
    } catch (error) {
      warnCaught("chat-model", error, "resolve chat model from server");
      cache.set(baseUrl, { modelId: null, expiresAt: Date.now() + FAIL_TTL_MS });
      return null;
    } finally {
      inflight.delete(baseUrl);
    }
  })();

  inflight.set(baseUrl, promise);
  return promise;
};
