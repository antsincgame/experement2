import { describe, it, expect } from "vitest";
import { cosineSimilarity, searchTopK, type EmbeddedChunk } from "./vector-store.js";

describe("cosineSimilarity", () => {
  it("returns 1 for identical direction and 0 for orthogonal", () => {
    expect(cosineSimilarity([1, 0], [2, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it("returns 0 for degenerate or mismatched vectors", () => {
    expect(cosineSimilarity([], [])).toBe(0);
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
  });
});

describe("searchTopK", () => {
  const chunks: EmbeddedChunk[] = [
    { id: "a", text: "A", source: "docs", vector: [1, 0] },
    { id: "b", text: "B", source: "docs", vector: [0.9, 0.1] },
    { id: "c", text: "C", source: "errors", vector: [0, 1] },
  ];

  it("returns the k most similar chunks, highest score first", () => {
    const top = searchTopK(chunks, [1, 0], 2);
    expect(top.map((c) => c.id)).toEqual(["a", "b"]);
    expect(top[0].score).toBeGreaterThanOrEqual(top[1].score);
  });

  it("skips chunks whose dimensionality differs from the query", () => {
    const mixed: EmbeddedChunk[] = [
      ...chunks,
      { id: "bad", text: "X", source: "docs", vector: [1, 2, 3] },
    ];
    const top = searchTopK(mixed, [1, 0], 10);
    expect(top.find((c) => c.id === "bad")).toBeUndefined();
  });

  it("returns empty for non-positive k or empty inputs", () => {
    expect(searchTopK(chunks, [1, 0], 0)).toEqual([]);
    expect(searchTopK([], [1, 0], 3)).toEqual([]);
    expect(searchTopK(chunks, [], 3)).toEqual([]);
  });
});
