// No module mocking. The thin runGitCommand wrapper is exercised with REAL git
// on operations that don't sign (init/rev-parse, which work in any environment),
// and the higher-level helpers are tested with an injected fake `run` so their
// logic (command order, hash extraction, version counting, error handling) is
// fully deterministic and independent of the git environment.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { GIT_HASH_PATTERN, runGitCommand, gitInit, gitCommit, getVersionNumber } from "./git.js";

describe("GIT_HASH_PATTERN", () => {
  it("accepts 7-64 char hex hashes (case-insensitive)", () => {
    expect(GIT_HASH_PATTERN.test("abc1234")).toBe(true);
    expect(GIT_HASH_PATTERN.test("ABCDEF1")).toBe(true);
    expect(GIT_HASH_PATTERN.test("a1b2c3d4e5f6")).toBe(true);
  });

  it("rejects short, non-hex, or injection-y strings", () => {
    expect(GIT_HASH_PATTERN.test("12345")).toBe(false);
    expect(GIT_HASH_PATTERN.test("g123456")).toBe(false);
    expect(GIT_HASH_PATTERN.test("abc123; rm -rf /")).toBe(false);
  });
});

describe("runGitCommand (real git, non-signing operations)", () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "git-test-"));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("returns trimmed stdout on success", () => {
    expect(runGitCommand(dir, ["init"]).toLowerCase()).toContain("repository");
  });

  it("throws on a failing command unless allowFailure is set", () => {
    expect(() => runGitCommand(dir, ["rev-parse", "HEAD"])).toThrow();
    expect(runGitCommand(dir, ["rev-parse", "HEAD"], { allowFailure: true })).toBe("");
  });
});

describe("git helpers (injected runner — deterministic, no real git)", () => {
  it("gitInit issues init, identity config, add, and commit in order", () => {
    const commands: string[] = [];
    gitInit("/p", (_projectPath, args) => {
      commands.push(args[0]);
      return "";
    });
    expect(commands).toEqual(["init", "config", "config", "add", "commit"]);
  });

  it("gitCommit returns the short hash from rev-parse", () => {
    const hash = gitCommit("/p", "msg", (_projectPath, args) =>
      args[0] === "rev-parse" ? "abc1234" : ""
    );
    expect(hash).toBe("abc1234");
  });

  it("gitCommit returns null when a git step throws", () => {
    expect(gitCommit("/p", "msg", () => {
      throw new Error("not a repo");
    })).toBeNull();
  });

  it("getVersionNumber is the commit count + 1 (or 1 when there is no log)", () => {
    expect(getVersionNumber("/p", () => "h1\nh2\nh3")).toBe(4);
    expect(getVersionNumber("/p", () => "")).toBe(1);
  });
});
