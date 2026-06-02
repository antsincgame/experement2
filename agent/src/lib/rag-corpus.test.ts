import { describe, it, expect } from "vitest";
import {
  buildDocChunks,
  fixesToChunks,
  examplesToChunks,
  assembleCorpus,
  corpusHash,
} from "./rag-corpus.js";

describe("buildDocChunks", () => {
  it("produces granular, heading-prefixed chunks from KNOWLEDGE_BASE", () => {
    const chunks = buildDocChunks();
    expect(chunks.length).toBeGreaterThan(5);
    expect(chunks.every((c) => c.source === "docs")).toBe(true);
    expect(chunks.every((c) => c.text.length > 0)).toBe(true);
    // Each chunk carries the topic heading for retrieval context.
    expect(chunks.some((c) => c.text.includes("RAG DOCS"))).toBe(true);
  });
});

describe("fixesToChunks", () => {
  it("maps fix records to error-tagged chunks", () => {
    const chunks = fixesToChunks([
      { errorSignature: "TS2322 ...", file: "a.tsx", fixSummary: "use number[]", timestamp: 1 },
    ]);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].source).toBe("errors");
    expect(chunks[0].text).toContain("TS2322");
    expect(chunks[0].text).toContain("use number[]");
  });
});

describe("examplesToChunks", () => {
  it("maps example summaries to example-tagged chunks", () => {
    const chunks = examplesToChunks([
      { project: "p", path: "src/stores/s.ts", type: "store", description: "S", exportSignature: "useS" },
    ]);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].source).toBe("examples");
    expect(chunks[0].text).toContain("src/stores/s.ts");
    expect(chunks[0].text).toContain("useS");
  });
});

describe("assembleCorpus", () => {
  it("always includes docs and appends provided errors/examples", () => {
    const docsOnly = assembleCorpus({});
    const full = assembleCorpus({
      fixes: [{ errorSignature: "e", file: "f", fixSummary: "fix", timestamp: 1 }],
      examples: [{ project: "p", path: "a.ts", type: "file", description: "d", exportSignature: "x" }],
    });
    expect(docsOnly.length).toBeGreaterThan(0);
    expect(full.length).toBe(docsOnly.length + 2);
  });
});

describe("corpusHash", () => {
  it("is stable for identical corpora and changes when content changes", () => {
    const base = assembleCorpus({});
    expect(corpusHash(base)).toBe(corpusHash(assembleCorpus({})));
    const changed = assembleCorpus({
      fixes: [{ errorSignature: "e", file: "f", fixSummary: "fix", timestamp: 1 }],
    });
    expect(corpusHash(changed)).not.toBe(corpusHash(base));
  });
});
