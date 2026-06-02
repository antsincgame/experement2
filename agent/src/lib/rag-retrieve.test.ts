import { describe, it, expect, vi } from "vitest";
import { getGenerationContext } from "./rag-retrieve.js";
import { KNOWLEDGE_BASE } from "../prompts/knowledge-base.js";
import type { EmbeddedChunk } from "./vector-store.js";

const fileInput = {
  path: "src/stores/expenseStore.ts",
  type: "store",
  description: "Global expense state",
  dependencies: ["@/types/index"],
};

describe("getGenerationContext", () => {
  it("falls back to keyword RAG when the index is unavailable", async () => {
    const keywordFallback = vi.fn(() => "KEYWORD-DOCS");
    const result = await getGenerationContext(fileInput, {
      deps: {
        loadIndex: async () => null,
        embedQuery: async () => [1, 0],
        keywordFallback,
      },
    });
    expect(result.semantic).toBe(false);
    expect(result.text).toBe("KEYWORD-DOCS");
    expect(keywordFallback).toHaveBeenCalledWith(fileInput.description, fileInput.dependencies);
  });

  it("falls back to keyword RAG when the query cannot be embedded", async () => {
    const index: EmbeddedChunk[] = [{ id: "x", text: "X", source: "docs", vector: [1, 0] }];
    const result = await getGenerationContext(fileInput, {
      deps: {
        loadIndex: async () => index,
        embedQuery: async () => null,
        keywordFallback: () => "KEYWORD",
      },
    });
    expect(result.semantic).toBe(false);
    expect(result.text).toBe("KEYWORD");
  });

  it("returns semantic top-k context with Tamagui core always prepended", async () => {
    const index: EmbeddedChunk[] = [
      { id: "near", text: "NEAR-DOC", source: "docs", vector: [1, 0] },
      { id: "far", text: "FAR-DOC", source: "examples", vector: [0, 1] },
    ];
    const result = await getGenerationContext(fileInput, {
      topK: 1,
      deps: {
        loadIndex: async () => index,
        embedQuery: async () => [1, 0],
      },
    });
    expect(result.semantic).toBe(true);
    expect(result.text).toContain(KNOWLEDGE_BASE.tamaguiCore);
    expect(result.text).toContain("NEAR-DOC");
    expect(result.text).not.toContain("FAR-DOC");
  });

  it("skips semantic search when semanticRagEnabled is false", async () => {
    const loadIndex = vi.fn(async () => [{ id: "x", text: "X", source: "docs", vector: [1, 0] }]);
    const result = await getGenerationContext(fileInput, {
      semanticRagEnabled: false,
      deps: { loadIndex },
    });
    expect(result.semantic).toBe(false);
    expect(loadIndex).not.toHaveBeenCalled();
  });
});
