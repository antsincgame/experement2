import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { recordFix, loadFixes, normalizeErrorSignature } from "./error-fix-store.js";

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
