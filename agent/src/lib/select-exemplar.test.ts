// Tests the learned-then-golden retrieval precedence (path B layered over path A).
// These use an injected temp `dir` so no real .rag is touched.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { recordExemplar } from "./exemplar-store.js";
import {
  selectExemplar,
  buildGoldenExampleBlock,
  selectGoldenExample,
  STORE_EXAMPLE,
} from "./golden-examples.js";

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "rag-select-"));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("selectExemplar (learned > golden, additive)", () => {
  it("prefers a LEARNED exemplar over the golden one when present", () => {
    recordExemplar(
      { type: "store", description: "recipe data store", code: "LEARNED-STORE-CODE" },
      { dir }
    );
    const result = selectExemplar({ type: "store", description: "recipe data store" }, { dir });
    expect(result).toBe("LEARNED-STORE-CODE");
    // It beats the curated golden store example.
    expect(result).not.toBe(STORE_EXAMPLE);
  });

  it("falls back to the GOLDEN exemplar when nothing was learned for that type", () => {
    // Learn only a screen; ask for a store → no learned store, golden store wins.
    recordExemplar({ type: "screen", description: "feed", code: "LEARNED-SCREEN" }, { dir });
    const result = selectExemplar({ type: "store", description: "global state" }, { dir });
    expect(result).toBe(STORE_EXAMPLE);
    expect(result).toBe(selectGoldenExample({ type: "store", description: "global state" }));
  });

  it("returns null when there is neither a learned nor a golden exemplar (additive)", () => {
    const result = selectExemplar({ type: "hook", description: "useTimer" }, { dir });
    expect(result).toBeNull();
  });

  it("uses the golden example when the store dir is empty (no .rag writes)", () => {
    const result = selectExemplar({ type: "component", description: "a card row" }, { dir });
    expect(result).not.toBeNull();
    expect(result).toBe(selectGoldenExample({ type: "component", description: "a card row" }));
  });
});

describe("buildGoldenExampleBlock (learned-aware, label preserved)", () => {
  it("wraps a learned exemplar under the same WORKING EXAMPLE label", () => {
    recordExemplar(
      { type: "screen", description: "a recipe feed", code: "LEARNED-FEED-CODE" },
      { dir }
    );
    const block = buildGoldenExampleBlock({ type: "screen", description: "a recipe feed" }, { dir });
    expect(block).toContain("## WORKING EXAMPLE");
    expect(block).toContain("LEARNED-FEED-CODE");
    // Exactly one exemplar is injected (TOP-1).
    expect(block.split("## WORKING EXAMPLE").length - 1).toBe(1);
  });

  it("is byte-identical to today when there is no learned exemplar (golden path)", () => {
    // With an empty store, the block must equal the pure-golden block.
    const withDir = buildGoldenExampleBlock({ type: "store", description: "data store" }, { dir });
    const goldenOnly = buildGoldenExampleBlock({ type: "store", description: "data store" });
    expect(withDir).toBe(goldenOnly);
  });

  it("is empty (additive) when neither learned nor golden exists", () => {
    expect(buildGoldenExampleBlock({ type: "hook", description: "useFoo" }, { dir })).toBe("");
  });
});
