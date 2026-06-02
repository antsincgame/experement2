import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({ spawnSync: vi.fn() }));
vi.mock("child_process", () => ({ spawnSync: mocks.spawnSync }));

import { GIT_HASH_PATTERN, runGitCommand, gitCommit } from "./git.js";

const ok = (stdout = "") => ({ status: 0, stdout, stderr: "", error: undefined });
const fail = (stderr = "boom") => ({ status: 1, stdout: "", stderr, error: undefined });

describe("GIT_HASH_PATTERN", () => {
  it("accepts 7-64 char hex hashes (case-insensitive)", () => {
    expect(GIT_HASH_PATTERN.test("abc1234")).toBe(true);
    expect(GIT_HASH_PATTERN.test("ABCDEF1")).toBe(true);
    expect(GIT_HASH_PATTERN.test("a1b2c3d4e5f6")).toBe(true);
  });

  it("rejects short, non-hex, or injection-y strings", () => {
    expect(GIT_HASH_PATTERN.test("12345")).toBe(false); // too short
    expect(GIT_HASH_PATTERN.test("g123456")).toBe(false); // non-hex
    expect(GIT_HASH_PATTERN.test("abc123; rm -rf /")).toBe(false);
  });
});

describe("runGitCommand", () => {
  beforeEach(() => mocks.spawnSync.mockReset());

  it("returns trimmed stdout on success", () => {
    mocks.spawnSync.mockReturnValue(ok("  deadbeef\n"));
    expect(runGitCommand("/p", ["rev-parse", "HEAD"])).toBe("deadbeef");
  });

  it("throws on non-zero exit unless allowFailure is set", () => {
    mocks.spawnSync.mockReturnValue(fail("fatal: not a repo"));
    expect(() => runGitCommand("/p", ["status"])).toThrow(/not a repo/);

    mocks.spawnSync.mockReturnValue(fail("fatal"));
    expect(runGitCommand("/p", ["log"], { allowFailure: true })).toBe("");
  });
});

describe("gitCommit", () => {
  beforeEach(() => mocks.spawnSync.mockReset());

  it("returns the short hash on success", () => {
    mocks.spawnSync
      .mockReturnValueOnce(ok()) // add
      .mockReturnValueOnce(ok()) // commit
      .mockReturnValueOnce(ok("abc1234")); // rev-parse
    expect(gitCommit("/p", "msg")).toBe("abc1234");
  });

  it("returns null when any git step fails", () => {
    mocks.spawnSync.mockReturnValue(fail());
    expect(gitCommit("/p", "msg")).toBeNull();
  });
});
