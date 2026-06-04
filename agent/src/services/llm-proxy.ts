// Separates Express and fetch response types so the LLM proxy remains strict-typecheck safe.
import type { Request, Response as ExpressResponse } from "express";
import { respondInvalidInput } from "../lib/request-validation.js";
import { LlmCompleteBodySchema } from "../schemas/runtime-input.schema.js";
import { assertLlmUrl, llmFetch } from "../lib/llm-url.js";
import { clearChatModelCache, resolveChatModel } from "./chat-model.js";

const DEFAULT_LM_STUDIO_URL = process.env.LM_STUDIO_URL?.trim() || "http://localhost:1234";

export const clearModelCache = (baseUrl?: string): void => {
  clearChatModelCache(baseUrl);
};

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Wire format accepted by LM Studio and most local OpenAI-compat servers. */
type ApiResponseFormat =
  | { type: "text" }
  | { type: "json_schema"; json_schema: { name: string; schema: Record<string, unknown> } };

interface CompletionRequest {
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  stream?: boolean;
  response_format?: ApiResponseFormat;
  model?: string;
}

/** Permissive object schema: constrains decoding to a JSON object without
 * over-restricting the shape (planner/editor shapes are validated separately). */
const PERMISSIVE_JSON_SCHEMA = {
  name: "structured_response",
  schema: { type: "object", additionalProperties: true },
} as const;

/**
 * Internal callers may request json_object (OpenAI). LM Studio rejects json_object
 * on the wire (HTTP 400) but accepts json_schema. Structured output is OFF by
 * default — many local OpenAI-compat servers reject response_format entirely, and
 * JSON shape is already enforced via system prompts + safeJsonParse. Set
 * LLM_JSON_SCHEMA=true to opt in to server-side guided decoding (a permissive
 * json_schema), which sharply cuts malformed/truncated planner output on servers
 * that support it.
 */
export const toApiResponseFormat = (
  format?: { type: "json_object" }
): ApiResponseFormat | undefined => {
  if (!format || process.env.LLM_JSON_SCHEMA !== "true") {
    return undefined;
  }
  return { type: "json_schema", json_schema: PERMISSIVE_JSON_SCHEMA };
};

type FetchResponse = globalThis.Response;

const activeControllers = new Map<string, AbortController>();
const MAX_CONCURRENT_LLM_REQUESTS = 3;
let activeRequestCount = 0;

export const streamCompletion = async (
  messages: ChatMessage[],
  options: {
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    responseFormat?: { type: "json_object" };
    model?: string;
    lmStudioUrl?: string;
    taskId?: string;
  } = {}
): Promise<AsyncGenerator<string>> => {
  const baseUrl = assertLlmUrl(options.lmStudioUrl ?? DEFAULT_LM_STUDIO_URL);

  if (activeRequestCount >= MAX_CONCURRENT_LLM_REQUESTS) {
    throw new Error(`Too many concurrent LLM requests (max ${MAX_CONCURRENT_LLM_REQUESTS})`);
  }
  activeRequestCount++;
  const controller = new AbortController();
  const taskId = options.taskId ?? crypto.randomUUID();

  activeControllers.set(taskId, controller);

  const resolvedModel = await resolveChatModel({
    url: baseUrl,
    explicitModel: options.model,
  });

  const body: CompletionRequest = {
    messages,
    temperature: options.temperature ?? 0.4,
    max_tokens: options.maxTokens ?? 65536,
    ...(options.topP !== undefined ? { top_p: options.topP } : {}),
    stream: true,
    ...(resolvedModel ? { model: resolvedModel } : {}),
  };

  const apiResponseFormat = toApiResponseFormat(options.responseFormat);
  if (apiResponseFormat) {
    body.response_format = apiResponseFormat;
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
  // Ceiling on the wait for the FIRST response headers. LM Studio blocks the POST
  // while it loads/swaps a model (the MoE planner swap can be slow), and the idle
  // timer below only arms AFTER headers arrive — so without this a stalled model
  // load freezes the request forever with no error (the silent "Plan" hang).
  // Generous enough for a cold large-model load, finite so it can never hang.
  const HEADER_TIMEOUT_MS = Number(process.env.LLM_HEADER_TIMEOUT_MS) || 120_000;
  let response: FetchResponse | undefined;
  let lastError = "";

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let headerTimedOut = false;
    const headerTimer = setTimeout(() => {
      headerTimedOut = true;
      controller.abort();
    }, HEADER_TIMEOUT_MS);
    try {
      response = await llmFetch(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(headerTimer);
      break; // success — exit retry loop
    } catch (fetchError) {
      clearTimeout(headerTimer);
      const msg = fetchError instanceof Error ? fetchError.message : String(fetchError);
      lastError = msg;

      if (headerTimedOut) {
        // No headers within budget — a stuck/loading model, not a user cancel.
        // Fail fast with a clear message instead of looping another 120s.
        activeControllers.delete(taskId);
        activeRequestCount = Math.max(0, activeRequestCount - 1);
        throw new Error(
          `LLM_TIMEOUT: ${baseUrl} sent no response within ${HEADER_TIMEOUT_MS / 1000}s ` +
          `(the model may be loading or stuck). Try a smaller/faster model.`
        );
      }

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
      const fallbackModel = await resolveChatModel({ url: baseUrl });
      if (fallbackModel && fallbackModel !== resolvedModel) {
        console.log(`[LLM] Model '${resolvedModel}' not found, falling back to '${fallbackModel}'`);
        body.model = fallbackModel;
        try {
          const retryResp = await llmFetch(`${baseUrl}/v1/chat/completions`, {
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

/**
 * The model-completion seam. generator/editor accept a value of this type
 * (defaulting to streamCompletion), so tests inject a scripted fake with plain
 * function passing instead of mocking the module — readable and debuggable.
 */
export type CompleteFn = typeof streamCompletion;

const NON_STREAMING_TIMEOUT_MS = 120_000;
const NON_STREAMING_MAX_RETRIES = 3;

export const completeNonStreaming = async (
  messages: ChatMessage[],
  options: {
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    responseFormat?: { type: "json_object" };
    model?: string;
    lmStudioUrl?: string;
  } = {}
): Promise<string> => {
  const baseUrl = assertLlmUrl(options.lmStudioUrl ?? DEFAULT_LM_STUDIO_URL);
  const resolvedModel = await resolveChatModel({
    url: baseUrl,
    explicitModel: options.model,
  });

  if (!resolvedModel) {
    throw new Error(
      "No LLM model available — check that LM Studio is running and has a chat model loaded"
    );
  }

  const body: CompletionRequest = {
    messages,
    temperature: options.temperature ?? 0.3,
    max_tokens: options.maxTokens ?? 65536,
    ...(options.topP !== undefined ? { top_p: options.topP } : {}),
    stream: false,
    model: resolvedModel,
  };

  const apiResponseFormat = toApiResponseFormat(options.responseFormat);
  if (apiResponseFormat) {
    body.response_format = apiResponseFormat;
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= NON_STREAMING_MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), NON_STREAMING_TIMEOUT_MS);

    try {
      const response = await llmFetch(`${baseUrl}/v1/chat/completions`, {
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
        await new Promise((resolve) => setTimeout(resolve, 5_000));
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
