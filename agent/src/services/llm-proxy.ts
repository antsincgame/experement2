// Separates Express and fetch response types so the LLM proxy remains strict-typecheck safe.
import type { Request, Response as ExpressResponse } from "express";
import { respondInvalidInput } from "../lib/request-validation.js";
import { LlmCompleteBodySchema } from "../schemas/runtime-input.schema.js";

const DEFAULT_LM_STUDIO_URL = process.env.LM_STUDIO_URL?.trim() || "http://localhost:1234";

interface CachedModelEntry {
  modelId: string | null;
  expiresAt: number;
}

const SUCCESS_MODEL_CACHE_TTL_MS = 5 * 60_000;
const FAILED_MODEL_CACHE_TTL_MS = 30_000;

const cachedModelIds = new Map<string, CachedModelEntry>();
const modelFetchPromises = new Map<string, Promise<string | null>>();

const getCachedModelId = (baseUrl: string): string | null | undefined => {
  const entry = cachedModelIds.get(baseUrl);
  if (!entry) {
    return undefined;
  }

  if (entry.expiresAt <= Date.now()) {
    cachedModelIds.delete(baseUrl);
    return undefined;
  }

  return entry.modelId;
};

const setCachedModelId = (
  baseUrl: string,
  modelId: string | null,
  ttlMs: number
): void => {
  cachedModelIds.set(baseUrl, {
    modelId,
    expiresAt: Date.now() + ttlMs,
  });
};

export const clearModelCache = (baseUrl?: string): void => {
  if (baseUrl) {
    cachedModelIds.delete(baseUrl);
    modelFetchPromises.delete(baseUrl);
    return;
  }

  cachedModelIds.clear();
  modelFetchPromises.clear();
};

const getDefaultModel = async (baseUrl: string): Promise<string | null> => {
  const cachedModelId = getCachedModelId(baseUrl);
  if (cachedModelId !== undefined) {
    return cachedModelId;
  }

  const existingPromise = modelFetchPromises.get(baseUrl);
  if (existingPromise) {
    return existingPromise;
  }

  const fetchPromise = (async () => {
    try {
      const resp = await fetch(`${baseUrl}/v1/models`);
      if (!resp.ok) {
        setCachedModelId(baseUrl, null, FAILED_MODEL_CACHE_TTL_MS);
        return null;
      }

      const data = await resp.json();
      const models = data.data ?? [];
      const preferred = models.find((model: { id: string }) =>
        model.id.includes("qwen3-coder")
      );
      const resolvedModel = preferred?.id ?? models[0]?.id ?? null;
      setCachedModelId(
        baseUrl,
        resolvedModel,
        resolvedModel ? SUCCESS_MODEL_CACHE_TTL_MS : FAILED_MODEL_CACHE_TTL_MS
      );
      // Model auto-detected silently
      return resolvedModel;
    } catch {
      setCachedModelId(baseUrl, null, FAILED_MODEL_CACHE_TTL_MS);
      return null;
    } finally {
      modelFetchPromises.delete(baseUrl);
    }
  })();

  modelFetchPromises.set(baseUrl, fetchPromise);
  return fetchPromise;
};

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface CompletionRequest {
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  response_format?: { type: "json_object" };
  model?: string;
}

type FetchResponse = globalThis.Response;

const activeControllers = new Map<string, AbortController>();
const MAX_CONCURRENT_LLM_REQUESTS = 3;
let activeRequestCount = 0;

export const streamCompletion = async (
  messages: ChatMessage[],
  options: {
    temperature?: number;
    maxTokens?: number;
    responseFormat?: { type: "json_object" };
    model?: string;
    lmStudioUrl?: string;
    taskId?: string;
  } = {}
): Promise<AsyncGenerator<string>> => {
  if (activeRequestCount >= MAX_CONCURRENT_LLM_REQUESTS) {
    throw new Error(`Too many concurrent LLM requests (max ${MAX_CONCURRENT_LLM_REQUESTS})`);
  }
  activeRequestCount++;

  const baseUrl = options.lmStudioUrl ?? DEFAULT_LM_STUDIO_URL;
  const controller = new AbortController();
  const taskId = options.taskId ?? crypto.randomUUID();

  activeControllers.set(taskId, controller);

  const resolvedModel = options.model || await getDefaultModel(baseUrl);

  const body: CompletionRequest = {
    messages,
    temperature: options.temperature ?? 0.4,
    max_tokens: options.maxTokens ?? 65536,
    stream: true,
    ...(resolvedModel ? { model: resolvedModel } : {}),
  };

  if (options.responseFormat) {
    body.response_format = options.responseFormat;
  }

  // Guard: prevent absurdly large payloads from crashing fetch
  const payloadSize = JSON.stringify(body).length;
  if (payloadSize > 5_000_000) {
    // Truncate messages content to fit
    for (const m of body.messages) {
      if (m.content.length > 50_000) {
        m.content = m.content.slice(0, 50_000) + "\n... [truncated]";
      }
    }
  }

  // Auto-retry with exponential backoff (3 attempts: 2s, 4s, 8s)
  const MAX_RETRIES = 3;
  const BACKOFF_BASE = 2000;
  let response: FetchResponse | undefined;
  let lastError = "";

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      break; // success — exit retry loop
    } catch (fetchError) {
      const msg = fetchError instanceof Error ? fetchError.message : String(fetchError);
      lastError = msg;

      if (msg.includes("abort") || msg.includes("cancel")) {
        // User aborted — don't retry
        activeControllers.delete(taskId);
        activeRequestCount = Math.max(0, activeRequestCount - 1);
        throw new Error(`LLM request aborted`);
      }

      if (attempt < MAX_RETRIES) {
        const delay = BACKOFF_BASE * Math.pow(2, attempt); // 2s, 4s, 8s
        console.log(`[LLM] Retry ${attempt + 1}/${MAX_RETRIES} after ${delay}ms (${msg})`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      // All retries exhausted
      activeControllers.delete(taskId);
      activeRequestCount = Math.max(0, activeRequestCount - 1);
      if (msg.includes("ECONNREFUSED") || msg.includes("fetch failed") || msg.includes("ENOTFOUND")) {
        throw new Error(`LLM_SERVER_DOWN: Cannot connect to ${baseUrl} after ${MAX_RETRIES} retries. Check that LM Studio is running.`);
      }
      throw new Error(`LLM_NETWORK_ERROR: ${msg}`);
    }
  }

  if (!response) {
    activeControllers.delete(taskId);
    activeRequestCount = Math.max(0, activeRequestCount - 1);
    throw new Error(`LLM_SERVER_DOWN: No response after ${MAX_RETRIES} retries. Last error: ${lastError}`);
  }

  if (!response.ok) {
    const errorText = await response.text();

    // If model not found (404) — clear cache and retry with auto-detected model
    if (response.status === 404 && errorText.includes("not found") && resolvedModel) {
      clearModelCache(baseUrl);
      const fallbackModel = await getDefaultModel(baseUrl);
      if (fallbackModel && fallbackModel !== resolvedModel) {
        console.log(`[LLM] Model '${resolvedModel}' not found, falling back to '${fallbackModel}'`);
        body.model = fallbackModel;
        try {
          const retryResp = await fetch(`${baseUrl}/v1/chat/completions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            signal: controller.signal,
          });
          if (retryResp.ok && retryResp.body) {
            response = retryResp;
          }
        } catch { /* fall through to error */ }
      }
    }

    if (!response.ok) {
      activeControllers.delete(taskId);
      activeRequestCount = Math.max(0, activeRequestCount - 1);
      throw new Error(`LLM error (${response.status}): ${errorText}`);
    }
  }

  if (!response.body) {
    activeControllers.delete(taskId);
    activeRequestCount = Math.max(0, activeRequestCount - 1);
    throw new Error("LM Studio returned no body");
  }

  const streamResponse = response;
  const responseBody = streamResponse.body;
  if (!responseBody) {
    activeControllers.delete(taskId);
    activeRequestCount = Math.max(0, activeRequestCount - 1);
    throw new Error("LM Studio returned no body");
  }

  async function* parseSSE(): AsyncGenerator<string> {
    const reader = responseBody!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const IDLE_TIMEOUT_MS = 60_000;
    let idleTimer: ReturnType<typeof setTimeout> | null = null;

    const resetIdleTimer = (): void => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        console.warn(`[LLM] Idle timeout ${IDLE_TIMEOUT_MS}ms — no chunks received, aborting stream`);
        controller.abort();
      }, IDLE_TIMEOUT_MS);
    };

    try {
      resetIdleTimer();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        resetIdleTimer();

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;

          const data = trimmed.slice(6);
          if (data === "[DONE]") return;

          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) yield content;
          } catch {
            // Partial JSON SSE chunks are ignored until a full payload arrives.
          }
        }
      }
    } finally {
      if (idleTimer) clearTimeout(idleTimer);
      reader.releaseLock();
      activeControllers.delete(taskId);
      activeRequestCount = Math.max(0, activeRequestCount - 1);
    }
  }

  return parseSSE();
};

const NON_STREAMING_TIMEOUT_MS = 60_000;
const NON_STREAMING_MAX_RETRIES = 1;

export const completeNonStreaming = async (
  messages: ChatMessage[],
  options: {
    temperature?: number;
    maxTokens?: number;
    responseFormat?: { type: "json_object" };
    model?: string;
    lmStudioUrl?: string;
  } = {}
): Promise<string> => {
  const baseUrl = options.lmStudioUrl ?? DEFAULT_LM_STUDIO_URL;
  const resolvedModel = options.model || await getDefaultModel(baseUrl);

  if (!resolvedModel) {
    throw new Error(
      "No LLM model available — check that LM Studio is running and has a model loaded"
    );
  }

  const body: CompletionRequest = {
    messages,
    temperature: options.temperature ?? 0.3,
    max_tokens: options.maxTokens ?? 65536,
    stream: false,
    model: resolvedModel,
  };

  if (options.responseFormat) {
    body.response_format = options.responseFormat;
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= NON_STREAMING_MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), NON_STREAMING_TIMEOUT_MS);

    try {
      const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`LM Studio error (${response.status}): ${errorText}`);
      }

      const json = await response.json();
      return json.choices?.[0]?.message?.content ?? "";
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (lastError.name === "AbortError") {
        throw new Error(`LM Studio request timed out after ${NON_STREAMING_TIMEOUT_MS}ms`);
      }

      if (attempt < NON_STREAMING_MAX_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, 2_000));
        continue;
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError ?? new Error("completeNonStreaming failed after retries");
};

export const getActiveRequestCount = (): number => activeRequestCount;

export const abortTask = (taskId: string): boolean => {
  const controller = activeControllers.get(taskId);
  if (!controller) return false;
  controller.abort();
  activeControllers.delete(taskId);
  return true;
};

export const abortAll = (): number => {
  let count = 0;
  for (const [id, controller] of activeControllers) {
    controller.abort();
    activeControllers.delete(id);
    count++;
  }
  return count;
};

export const handleLLMProxyRoute = async (
  req: Request,
  res: ExpressResponse
): Promise<void> => {
  const parsedBody = LlmCompleteBodySchema.safeParse(req.body);
  if (!parsedBody.success) {
    respondInvalidInput(res, parsedBody.error);
    return;
  }

  const {
    messages,
    temperature,
    max_tokens,
    stream,
    response_format,
    model,
    lmStudioUrl,
  } = parsedBody.data;

  if (stream) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    try {
      const generator = await streamCompletion(messages, {
        temperature,
        maxTokens: max_tokens,
        responseFormat: response_format,
        model,
        lmStudioUrl,
      });

      for await (const chunk of generator) {
        res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
      }
      res.write("data: [DONE]\n\n");
      res.end();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
      res.end();
    }
    return;
  }

  try {
    const result = await completeNonStreaming(messages, {
      temperature,
      maxTokens: max_tokens,
      responseFormat: response_format,
      model,
      lmStudioUrl,
    });
    res.json({ data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(502).json({ error: message, code: "LLM_ERROR" });
  }
};
