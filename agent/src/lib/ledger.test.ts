import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { recordLedgerEntry, loadLedger, summarizeLedger } from "./ledger.js";

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "rag-ledger-"));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const entry = (over = {}) => ({
  score: 80,
  source: "clean",
  repairs: 0,
  bestOfN: 1,
  buildSuccess: true,
  ...over,
});

describe("ledger", () => {
  it("appends entries with a timestamp and loads them back", () => {
    recordLedgerEntry(entry({ score: 70 }), { dir });
    recordLedgerEntry(entry({ score: 90 }), { dir });
    const loaded = loadLedger(dir);
    expect(loaded).toHaveLength(2);
    expect(loaded[0].score).toBe(70);
    expect(typeof loaded[0].at).toBe("string");
  });

  it("summarizes lifetime vs recent average (the accretive-improvement signal)", () => {
    // Older low-quality run, then improving — recent average should exceed lifetime.
    for (const s of [40, 50, 60, 80, 90, 95]) recordLedgerEntry(entry({ score: s }), { dir });
    const s = summarizeLedger(dir, 2);
    expect(s.count).toBe(6);
    expect(s.recentAvgScore).toBeGreaterThan(s.avgScore); // improving over time
    expect(s.successRate).toBe(100);
  });

  it("reports successRate over build outcomes", () => {
    recordLedgerEntry(entry({ buildSuccess: true }), { dir });
    recordLedgerEntry(entry({ buildSuccess: false }), { dir });
    expect(summarizeLedger(dir).successRate).toBe(50);
  });

  it("returns an empty summary for no ledger and never throws on a corrupt file", () => {
    expect(summarizeLedger(dir)).toMatchObject({ count: 0, avgScore: 0 });
    fs.writeFileSync(path.join(dir, "ledger.json"), "{ bad", "utf-8");
    expect(() => loadLedger(dir)).not.toThrow();
    expect(loadLedger(dir)).toEqual([]);
  });
});
