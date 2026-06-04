import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import {
  recordExemplar,
  loadExemplars,
  findBestExemplar,
} from "./exemplar-store.js";

let dir: string;

const storeFile = (d: string): string => path.join(d, "exemplars.json");

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "rag-exemplar-"));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("recordExemplar / loadExemplars", () => {
  it("round-trips a recorded exemplar", () => {
    recordExemplar(
      { type: "screen", description: "a notes feed", code: "export default function X(){}" },
      { dir }
    );
    const all = loadExemplars(dir);
    expect(all).toHaveLength(1);
    expect(all[0].type).toBe("screen");
    expect(all[0].description).toBe("a notes feed");
    expect(all[0].code).toContain("export default");
    expect(typeof all[0].hash).toBe("string");
  });

  it("lowercases the type so retrieval matches regardless of case", () => {
    recordExemplar({ type: "SCREEN", description: "feed", code: "code-a" }, { dir });
    expect(loadExemplars(dir)[0].type).toBe("screen");
  });

  it("dedupes by content hash (same code is a no-op)", () => {
    recordExemplar({ type: "store", description: "one", code: "const a = 1;" }, { dir });
    recordExemplar({ type: "store", description: "two", code: "const a = 1;" }, { dir });
    const all = loadExemplars(dir);
    expect(all).toHaveLength(1);
    // First write wins; the duplicate is dropped entirely.
    expect(all[0].description).toBe("one");
  });

  it("caps the store at the most-recent 8 PER type, dropping the oldest", () => {
    for (let i = 0; i < 12; i++) {
      recordExemplar({ type: "screen", description: `s${i}`, code: `screen-${i}` }, { dir });
    }
    for (let i = 0; i < 12; i++) {
      recordExemplar({ type: "store", description: `t${i}`, code: `store-${i}` }, { dir });
    }
    const all = loadExemplars(dir);
    const screens = all.filter((e) => e.type === "screen");
    const stores = all.filter((e) => e.type === "store");
    expect(screens).toHaveLength(8);
    expect(stores).toHaveLength(8);
    // The 8 most-recent screens survived; the first 4 were dropped.
    expect(screens.some((e) => e.code === "screen-0")).toBe(false);
    expect(screens.some((e) => e.code === "screen-11")).toBe(true);
  });

  it("trims overly long code to the line cap (~120 lines)", () => {
    const longCode = Array.from({ length: 300 }, (_, i) => `line ${i}`).join("\n");
    recordExemplar({ type: "component", description: "big", code: longCode }, { dir });
    const stored = loadExemplars(dir)[0].code;
    expect(stored.split("\n").length).toBeLessThanOrEqual(120);
  });

  it("ignores empty type or empty code", () => {
    recordExemplar({ type: "", description: "d", code: "code" }, { dir });
    recordExemplar({ type: "screen", description: "d", code: "   " }, { dir });
    expect(loadExemplars(dir)).toHaveLength(0);
  });

  it("returns [] when no store file exists", () => {
    expect(loadExemplars(path.join(dir, "missing"))).toEqual([]);
  });

  it("returns [] for a corrupt store without throwing", () => {
    fs.writeFileSync(storeFile(dir), "{ not valid json", "utf-8");
    expect(loadExemplars(dir)).toEqual([]);
  });

  it("never throws even if the dir is unwritable (best-effort capture)", () => {
    // Point at a path whose parent is a file, so mkdir/write fails internally.
    const filePath = path.join(dir, "afile");
    fs.writeFileSync(filePath, "x", "utf-8");
    const badDir = path.join(filePath, "nested");
    expect(() =>
      recordExemplar({ type: "screen", description: "d", code: "code" }, { dir: badDir })
    ).not.toThrow();
  });
});

describe("findBestExemplar", () => {
  it("filters by type and returns the top-1 by description overlap", () => {
    recordExemplar({ type: "screen", description: "recipe browser feed", code: "recipe-code" }, { dir });
    recordExemplar({ type: "screen", description: "settings preferences", code: "settings-code" }, { dir });
    recordExemplar({ type: "store", description: "recipe data", code: "store-code" }, { dir });

    const hit = findBestExemplar({ type: "screen", description: "a recipe browsing feed" }, { dir });
    expect(hit).toBe("recipe-code");
  });

  it("returns the most-recent same-type exemplar when the description signal is weak", () => {
    recordExemplar({ type: "store", description: "alpha", code: "store-old" }, { dir });
    recordExemplar({ type: "store", description: "beta", code: "store-new" }, { dir });
    const hit = findBestExemplar({ type: "store", description: "zzz unrelated qqq" }, { dir });
    expect(hit).toBe("store-new");
  });

  it("returns null when no exemplar of that type was learned", () => {
    recordExemplar({ type: "screen", description: "feed", code: "screen-code" }, { dir });
    expect(findBestExemplar({ type: "store", description: "any" }, { dir })).toBeNull();
  });

  it("returns null for an empty store", () => {
    expect(findBestExemplar({ type: "screen", description: "feed" }, { dir })).toBeNull();
  });

  it("returns null for an empty type", () => {
    recordExemplar({ type: "screen", description: "feed", code: "c" }, { dir });
    expect(findBestExemplar({ type: "", description: "feed" }, { dir })).toBeNull();
  });

  it("returns null for a corrupt store without throwing", () => {
    fs.writeFileSync(storeFile(dir), "{ bad json", "utf-8");
    expect(findBestExemplar({ type: "screen", description: "feed" }, { dir })).toBeNull();
  });
});
