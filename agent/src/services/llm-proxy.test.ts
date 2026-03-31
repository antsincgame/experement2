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
      .mockResolvedValueOnce(mockCompletionResponse("first reply"))
      .mockResolvedValueOnce(mockModelsResponse(["qwen3-coder-32b"]))
      .mockResolvedValueOnce(mockCompletionResponse("second reply"));

    vi.stubGlobal("fetch", fetchMock);

    await completeNonStreaming(
      [{ role: "user", content: "hello" }],
      { lmStudioUrl: "http://lm-studio.test" }
    );

    const firstCompletionBody = JSON.parse(
      fetchMock.mock.calls[1]?.[1]?.body as string
    ) as { model?: string };
    expect(firstCompletionBody.model).toBeUndefined();

    clearModelCache("http://lm-studio.test");

    await completeNonStreaming(
      [{ role: "user", content: "hello again" }],
      { lmStudioUrl: "http://lm-studio.test" }
    );

    const secondCompletionBody = JSON.parse(
      fetchMock.mock.calls[3]?.[1]?.body as string
    ) as { model?: string };
    expect(secondCompletionBody.model).toBe("qwen3-coder-32b");
  });
});
