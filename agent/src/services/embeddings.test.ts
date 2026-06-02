import { describe, it, expect, vi } from "vitest";
import { embedTexts, embedText } from "./embeddings.js";

const okResponse = (vectors: number[][]): Response =>
  ({
    ok: true,
    json: async () => ({ data: vectors.map((embedding) => ({ embedding })) }),
  }) as unknown as Response;

describe("embedTexts", () => {
  it("returns one vector per input on success", async () => {
    const fetchFn = vi.fn(async () => okResponse([[1, 2], [3, 4]]));
    const result = await embedTexts(["a", "b"], {
      model: "embed-model",
      url: "http://localhost:1234",
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    expect(result).toEqual([[1, 2], [3, 4]]);
    expect(fetchFn).toHaveBeenCalledWith(
      "http://localhost:1234/v1/embeddings",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("returns null when auto-resolve finds no embedding model", async () => {
    const fetchFn = vi.fn(async (url: string) => {
      if (url.includes("/v1/models")) {
        return {
          ok: true,
          json: async () => ({ data: [{ id: "llama-chat-only" }] }),
        } as unknown as Response;
      }
      return { ok: false } as unknown as Response;
    });
    const result = await embedTexts(["a"], {
      model: "",
      url: "http://localhost:1234",
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    expect(result).toBeNull();
  });

  it("returns null on a non-ok response", async () => {
    const fetchFn = vi.fn(async () => ({ ok: false }) as unknown as Response);
    const result = await embedTexts(["a"], {
      model: "m",
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    expect(result).toBeNull();
  });

  it("returns null on a network throw", async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });
    const result = await embedTexts(["a"], {
      model: "m",
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    expect(result).toBeNull();
  });

  it("returns null when the row count does not match inputs", async () => {
    const fetchFn = vi.fn(async () => okResponse([[1, 2]]));
    const result = await embedTexts(["a", "b"], {
      model: "m",
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    expect(result).toBeNull();
  });

  it("returns null for a disallowed (SSRF) host", async () => {
    const fetchFn = vi.fn();
    const result = await embedTexts(["a"], {
      model: "m",
      url: "http://evil.example.com",
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    expect(result).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("short-circuits an empty input list", async () => {
    const fetchFn = vi.fn();
    const result = await embedTexts([], {
      model: "m",
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    expect(result).toEqual([]);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe("embedText", () => {
  it("returns the single vector on success", async () => {
    const fetchFn = vi.fn(async () => okResponse([[7, 8, 9]]));
    const result = await embedText("hi", {
      model: "m",
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    expect(result).toEqual([7, 8, 9]);
  });

  it("returns null when unavailable", async () => {
    const result = await embedText("hi", { model: "" });
    expect(result).toBeNull();
  });
});
