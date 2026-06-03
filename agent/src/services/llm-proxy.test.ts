// Verifies model discovery cache behavior so transient LM Studio failures do not poison future requests.
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearModelCache, completeNonStreaming, streamCompletion, toApiResponseFormat } from "./llm-proxy.js";

const mockModelsResponse = (ids: string[]) => ({
  ok: true,
  json: async () => ({
    data: ids.map((id) => ({ id })),
  }),
});

const mockCompletionResponse = (content: string) => ({
  ok: true,
  json: async () => ({
    choices: [
      {
        message: { content },
      },
    ],
  }),
});

describe("llm-proxy model caching", () => {
  afterEach(() => {
    clearModelCache();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("retries model discovery after a failed cache entry is cleared", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(mockModelsResponse(["qwen3-coder-32b"]))
      .mockResolvedValueOnce(mockCompletionResponse("second reply"));

    vi.stubGlobal("fetch", fetchMock);

    await expect(
      completeNonStreaming(
        [{ role: "user", content: "hello" }],
        { lmStudioUrl: "http://127.0.0.1:1234" }
      )
    ).rejects.toThrow("No LLM model available");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    clearModelCache("http://127.0.0.1:1234");

    await completeNonStreaming(
      [{ role: "user", content: "hello again" }],
      { lmStudioUrl: "http://127.0.0.1:1234" }
    );

    const secondCompletionBody = JSON.parse(
      fetchMock.mock.calls[2]?.[1]?.body as string
    ) as { model?: string };
    expect(secondCompletionBody.model).toBe("qwen3-coder-32b");
  });

  it("auto-selects a chat model when an embedding model is listed first", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        mockModelsResponse([
          "text-embedding-nomic-embed-text-v1.5",
          "qwen3-coder-32b",
        ])
      )
      .mockResolvedValueOnce(mockCompletionResponse("enhanced prompt"));

    vi.stubGlobal("fetch", fetchMock);

    const result = await completeNonStreaming(
      [{ role: "user", content: "notes app" }],
      { lmStudioUrl: "http://127.0.0.1:1234" }
    );

    expect(result).toBe("enhanced prompt");
    const body = JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string) as {
      model?: string;
    };
    expect(body.model).toBe("qwen3-coder-32b");
  });

  it("does not send json_object to LM Studio (unsupported response_format)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockModelsResponse(["qwen3-coder-32b"]))
      .mockResolvedValueOnce(mockCompletionResponse("{}"));

    vi.stubGlobal("fetch", fetchMock);

    await completeNonStreaming(
      [{ role: "user", content: "plan" }],
      {
        lmStudioUrl: "http://127.0.0.1:1234",
        responseFormat: { type: "json_object" },
      }
    );

    const body = JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string) as {
      response_format?: { type: string };
    };
    expect(body.response_format).toBeUndefined();
  });
});

describe("toApiResponseFormat", () => {
  it("maps json_object to omitted (prompt-based JSON)", () => {
    expect(toApiResponseFormat({ type: "json_object" })).toBeUndefined();
    expect(toApiResponseFormat()).toBeUndefined();
  });
});

describe("streamCompletion header timeout (silent-freeze guard)", () => {
  afterEach(() => {
    vi.useRealTimers();
    delete process.env.LLM_HEADER_TIMEOUT_MS;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("fails fast with LLM_TIMEOUT when no response headers arrive within budget", async () => {
    process.env.LLM_HEADER_TIMEOUT_MS = "1000";
    vi.useFakeTimers();

    // A model that never sends headers — but honors the abort signal, like a real
    // fetch would. Without the header timeout this awaits forever (the silent hang).
    const fetchMock = vi.fn((_url: string, opts: { signal: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        opts.signal.addEventListener("abort", () =>
          reject(new Error("This operation was aborted"))
        );
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const promise = streamCompletion(
      [{ role: "user", content: "plan a notes app" }],
      { lmStudioUrl: "http://127.0.0.1:1234", model: "qwen3-coder", taskId: "freeze-test" }
    );
    const assertion = expect(promise).rejects.toThrow(/LLM_TIMEOUT/);
    await vi.advanceTimersByTimeAsync(1_001);
    await assertion;
  });
});
