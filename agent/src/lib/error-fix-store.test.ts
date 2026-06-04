import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import {
  recordFix,
  loadFixes,
  normalizeErrorSignature,
  findSimilarFixes,
  buildPastFixBlock,
} from "./error-fix-store.js";

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "rag-fix-"));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("normalizeErrorSignature", () => {
  it("strips paths, positions, and literals so similar errors collapse", () => {
    const a = normalizeErrorSignature(
      `D:\\proj\\src\\A.tsx(68,17): error TS2322: Property 'minValue' does not exist`
    );
    const b = normalizeErrorSignature(
      `D:\\proj\\src\\B.tsx(99,3): error TS2322: Property 'maxValue' does not exist`
    );
    expect(a).toBe(b);
    expect(a).toContain("TS2322");
    expect(a).not.toContain("68");
  });
});

describe("recordFix / loadFixes", () => {
  it("round-trips a recorded fix", () => {
    recordFix({ errorSignature: "TS2304 Cannot find name x", file: "a.tsx", fixSummary: "import x" }, dir);
    const fixes = loadFixes(dir);
    expect(fixes).toHaveLength(1);
    expect(fixes[0].file).toBe("a.tsx");
    expect(fixes[0].fixSummary).toBe("import x");
  });

  it("dedupes by normalized signature, keeping the latest fix", () => {
    recordFix({ errorSignature: "D:\\a.tsx(1,1): error TS1: bad", file: "a", fixSummary: "first" }, dir);
    recordFix({ errorSignature: "D:\\b.tsx(2,2): error TS1: bad", file: "b", fixSummary: "second" }, dir);
    const fixes = loadFixes(dir);
    expect(fixes).toHaveLength(1);
    expect(fixes[0].fixSummary).toBe("second");
  });

  it("ignores empty signatures or summaries", () => {
    recordFix({ errorSignature: "", file: "a", fixSummary: "x" }, dir);
    recordFix({ errorSignature: "real error", file: "a", fixSummary: "   " }, dir);
    expect(loadFixes(dir)).toHaveLength(0);
  });

  it("returns an empty array when no store exists", () => {
    expect(loadFixes(path.join(dir, "missing"))).toEqual([]);
  });
});

describe("findSimilarFixes", () => {
  it("returns the exact-signature match first", () => {
    recordFix(
      { errorSignature: "src/A.tsx(1,1): error TS2304: Cannot find name 'View'", file: "src/A.tsx", fixSummary: "import View from react-native" },
      dir
    );
    recordFix(
      { errorSignature: "src/B.tsx(9,2): error TS2305: Module 'tamagui' has no exported member 'Pressable'", file: "src/B.tsx", fixSummary: "import Pressable from react-native" },
      dir
    );

    // A different path/position but the same class of TS2304 error → same signature.
    const hits = findSimilarFixes(
      "src/Z.tsx(42,7): error TS2304: Cannot find name 'View'",
      { dir }
    );
    expect(hits).toHaveLength(1);
    expect(hits[0].errorSignature).toContain("TS2304");
    expect(hits[0].fixSummary).toContain("react-native");
  });

  it("ranks an exact match above a merely-overlapping one", () => {
    recordFix(
      { errorSignature: "src/A.tsx(1,1): error TS2322: Property 'minValue' missing on Slider", file: "a", fixSummary: "exact" },
      dir
    );
    recordFix(
      { errorSignature: "src/B.tsx(2,2): error TS2322: Slider received an unexpected prop", file: "b", fixSummary: "overlap" },
      dir
    );
    const hits = findSimilarFixes(
      "src/C.tsx(3,3): error TS2322: Property 'minValue' missing on Slider",
      { dir, limit: 2 }
    );
    expect(hits[0].fixSummary).toBe("exact");
  });

  it("returns nothing for an unrelated error", () => {
    recordFix(
      { errorSignature: "error TS2304: Cannot find name 'View'", file: "a", fixSummary: "import View" },
      dir
    );
    expect(
      findSimilarFixes("Unable to resolve module './missing-asset.png'", { dir })
    ).toEqual([]);
  });

  it("respects the limit (default 1, capped at 2)", () => {
    recordFix({ errorSignature: "error TS2322: Slider prop alpha bad", file: "a", fixSummary: "1" }, dir);
    recordFix({ errorSignature: "error TS2322: Slider prop beta bad", file: "b", fixSummary: "2" }, dir);
    recordFix({ errorSignature: "error TS2322: Slider prop gamma bad", file: "c", fixSummary: "3" }, dir);

    expect(findSimilarFixes("error TS2322: Slider prop delta bad", { dir })).toHaveLength(1);
    expect(findSimilarFixes("error TS2322: Slider prop delta bad", { dir, limit: 2 })).toHaveLength(2);
    // limit is hard-capped at 2 even if a caller asks for more.
    expect(findSimilarFixes("error TS2322: Slider prop delta bad", { dir, limit: 5 })).toHaveLength(2);
  });

  it("returns [] for an empty store", () => {
    expect(findSimilarFixes("error TS2304: anything", { dir })).toEqual([]);
  });

  it("returns [] for empty/whitespace query text", () => {
    recordFix({ errorSignature: "error TS2304: Cannot find name 'View'", file: "a", fixSummary: "x" }, dir);
    expect(findSimilarFixes("", { dir })).toEqual([]);
    expect(findSimilarFixes("   ", { dir })).toEqual([]);
  });

  it("tolerates a malformed/corrupt store without throwing", () => {
    fs.writeFileSync(path.join(dir, "error-fixes.json"), "{ not valid json", "utf-8");
    expect(findSimilarFixes("error TS2304: Cannot find name 'View'", { dir })).toEqual([]);
  });
});

describe("buildPastFixBlock", () => {
  it("renders a labelled, compact block from records", () => {
    const block = buildPastFixBlock([
      { errorSignature: "error TS2304: Cannot find name 'View'", file: "src/A.tsx", fixSummary: "import { View } from 'react-native'", timestamp: 1 },
    ]);
    expect(block).toContain("## PAST FIX FOR A SIMILAR ERROR");
    expect(block).toContain("ERROR: error TS2304");
    expect(block).toContain("FIX (src/A.tsx): import { View }");
  });

  it("truncates long fix summaries to keep the prompt bounded", () => {
    const long = "x".repeat(1000);
    const block = buildPastFixBlock([
      { errorSignature: "sig", file: "f", fixSummary: long, timestamp: 1 },
    ]);
    expect(block).toContain("x".repeat(300));
    expect(block).not.toContain("x".repeat(301));
  });

  it("returns an empty string when there is nothing to inject", () => {
    expect(buildPastFixBlock([])).toBe("");
  });
});
