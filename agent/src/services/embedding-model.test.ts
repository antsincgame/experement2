import { describe, it, expect, vi, beforeEach } from "vitest";
import { clearEmbeddingModelCache, resolveEmbeddingModel } from "./embedding-model.js";

beforeEach(() => {
  clearEmbeddingModelCache();
});

describe("resolveEmbeddingModel", () => {
  it("returns an explicit override without calling the server", async () => {
    const fetchFn = vi.fn();
    const result = await resolveEmbeddingModel({
      explicitModel: "my-embed-model",
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    expect(result).toBe("my-embed-model");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("picks an embedding-looking model from /v1/models", async () => {
    const fetchFn = vi.fn(async (url: string) => {
      if (url.includes("/v1/models")) {
        return {
          ok: true,
          json: async () => ({
            data: [
              { id: "llama-3-8b" },
              { id: "text-embedding-nomic-embed-text-v1.5" },
            ],
          }),
        } as unknown as Response;
      }
      throw new Error("unexpected");
    });
    const result = await resolveEmbeddingModel({
      url: "http://localhost:1234",
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    expect(result).toBe("text-embedding-nomic-embed-text-v1.5");
  });

  it("returns null when only chat models are loaded", async () => {
    const fetchFn = vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: [{ id: "llama-3-70b-instruct" }] }),
    })) as unknown as typeof fetch;
    const result = await resolveEmbeddingModel({
      url: "http://localhost:1234",
      fetchFn,
    });
    expect(result).toBeNull();
  });
});
