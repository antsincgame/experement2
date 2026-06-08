import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { atomicWriteFileSync } from "./atomic-write.js";

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "atomic-write-"));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("atomicWriteFileSync", () => {
  it("writes content and creates missing parent directories", () => {
    const target = path.join(dir, "nested", "deep", "data.json");
    atomicWriteFileSync(target, '{"a":1}');
    expect(fs.readFileSync(target, "utf-8")).toBe('{"a":1}');
  });

  it("atomically overwrites an existing file", () => {
    const target = path.join(dir, "data.json");
    atomicWriteFileSync(target, "first");
    atomicWriteFileSync(target, "second");
    expect(fs.readFileSync(target, "utf-8")).toBe("second");
  });

  it("leaves no temp files behind on success", () => {
    const target = path.join(dir, "data.json");
    atomicWriteFileSync(target, "x");
    const leftovers = fs.readdirSync(dir).filter((f) => f.includes(".tmp"));
    expect(leftovers).toEqual([]);
  });
});
