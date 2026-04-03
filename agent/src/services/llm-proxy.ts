// Validates LLM proxy requests and caches model discovery with failure invalidation per LM Studio URL.
import type { Request, Response } from "express";
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
      console.log(`[LLM] Auto-detected model for ${baseUrl}: ${resolvedModel}`);
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
    max_tokens: options.maxTokens ?? 32768,
    stream: true,
    ...(resolvedModel ? { model: resolvedModel } : {}),
  };

  if (options.responseFormat) {
    body.response_format = options.responseFormat;
  }

  const response = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: controller.signal,
  });

  if (!response.ok) {
    activeControllers.delete(taskId);
    activeRequestCount = Math.max(0, activeRequestCount - 1);
    const errorText = await response.text();
    throw new Error(`LM Studio error (${response.status}): ${errorText}`);
  }

  if (!response.body) {
    activeControllers.delete(taskId);
    activeRequestCount = Math.max(0, activeRequestCount - 1);
    throw new Error("LM Studio returned no body");
  }

  async function* parseSSE(): AsyncGenerator<string> {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

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
      reader.releaseLock();
      activeControllers.delete(taskId);
      activeRequestCount = Math.max(0, activeRequestCount - 1);
    }
  }

  return parseSSE();
};

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

  const body: CompletionRequest = {
    messages,
    temperature: options.temperature ?? 0.3,
    max_tokens: options.maxTokens ?? 32768,
    stream: false,
    ...(resolvedModel ? { model: resolvedModel } : {}),
  };

  if (options.responseFormat) {
    body.response_format = options.responseFormat;
  }

  const response = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LM Studio error (${response.status}): ${errorText}`);
  }

  const json = await response.json();
  return json.choices?.[0]?.message?.content ?? "";
};

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
  res: Response
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
