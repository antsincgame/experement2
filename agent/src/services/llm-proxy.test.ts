// Verifies model discovery cache behavior so transient LM Studio failures do not poison future requests.
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearModelCache, completeNonStreaming } from "./llm-proxy.js";

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
});
