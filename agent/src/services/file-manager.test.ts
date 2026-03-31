// Verifies safe workspace and project path resolution for all file manager operations.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";

let tmpDir: string;
let originalCwd: () => string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fm-test-"));
  originalCwd = process.cwd;
  const fakeCwd = path.join(tmpDir, "agent");
  fs.mkdirSync(fakeCwd, { recursive: true });
  process.cwd = () => fakeCwd;
});

afterEach(() => {
  process.cwd = originalCwd;
  fs.rmSync(tmpDir, { recursive: true, force: true });
  vi.resetModules();
});

const loadModule = async () => import("./file-manager.js");

describe("file-manager", () => {
  it("writeFile creates file and nested directories", async () => {
    const fm = await loadModule();
    fm.writeFile("test-project", "src/utils/helper.ts", "export const x = 1;");

    const fullPath = path.join(
      fm.getProjectPath("test-project"),
      "src/utils/helper.ts"
    );

    expect(fs.existsSync(fullPath)).toBe(true);
    expect(fs.readFileSync(fullPath, "utf-8")).toBe("export const x = 1;");
  });

  it("readFile returns content of existing file", async () => {
    const fm = await loadModule();
    fm.writeFile("test-project", "index.ts", "hello world");

    expect(fm.readFile("test-project", "index.ts")).toBe("hello world");
  });

  it("readFile returns null for non-existent file", async () => {
    const fm = await loadModule();
    expect(fm.readFile("test-project", "missing.ts")).toBeNull();
  });

  it("listAllFiles performs recursive traversal", async () => {
    const fm = await loadModule();
    fm.writeFile("test-project", "a.ts", "a");
    fm.writeFile("test-project", "src/b.ts", "b");
    fm.writeFile("test-project", "src/deep/c.ts", "c");

    expect(fm.listAllFiles("test-project")).toEqual([
      "a.ts",
      "src/b.ts",
      "src/deep/c.ts",
    ]);
  });

  it("listAllFiles skips node_modules and .git", async () => {
    const fm = await loadModule();
    fm.writeFile("test-project", "index.ts", "ok");

    const projectPath = fm.getProjectPath("test-project");
    fs.mkdirSync(path.join(projectPath, "node_modules"), { recursive: true });
    fs.writeFileSync(path.join(projectPath, "node_modules", "pkg.js"), "module");
    fs.mkdirSync(path.join(projectPath, ".git"), { recursive: true });
    fs.writeFileSync(path.join(projectPath, ".git", "config"), "git");

    expect(fm.listAllFiles("test-project")).toEqual(["index.ts"]);
  });

  it("projectExists returns true for existing project", async () => {
    const fm = await loadModule();
    fm.writeFile("my-app", "package.json", "{}");
    expect(fm.projectExists("my-app")).toBe(true);
  });

  it("projectExists returns false for missing project", async () => {
    const fm = await loadModule();
    expect(fm.projectExists("nonexistent-project")).toBe(false);
  });

  it("getProjectPath returns an absolute workspace path", async () => {
    const fm = await loadModule();
    const projectPath = fm.getProjectPath("my-app");
    expect(path.isAbsolute(projectPath)).toBe(true);
    expect(projectPath).toContain("workspace");
    expect(projectPath).toContain("my-app");
  });

  it("deleteFile removes an existing file and returns true", async () => {
    const fm = await loadModule();
    fm.writeFile("test-project", "temp.ts", "delete me");

    expect(fm.deleteFile("test-project", "temp.ts")).toBe(true);
    expect(fm.readFile("test-project", "temp.ts")).toBeNull();
  });

  it("deleteFile returns false for non-existent file", async () => {
    const fm = await loadModule();
    expect(fm.deleteFile("test-project", "ghost.ts")).toBe(false);
  });

  it("fileExists returns the correct boolean", async () => {
    const fm = await loadModule();
    expect(fm.fileExists("test-project", "x.ts")).toBe(false);
    fm.writeFile("test-project", "x.ts", "content");
    expect(fm.fileExists("test-project", "x.ts")).toBe(true);
  });

  it("getFileTree returns directories before files", async () => {
    const fm = await loadModule();
    fm.writeFile("test-project", "z-file.ts", "z");
    fm.writeFile("test-project", "a-file.ts", "a");
    fm.writeFile("test-project", "src/inner.ts", "inner");

    const tree = fm.getFileTree("test-project");
    expect(tree[0].type).toBe("directory");
    expect(tree[0].name).toBe("src");

    const fileNames = tree.filter((node) => node.type === "file").map((node) => node.name);
    expect(fileNames).toEqual(["a-file.ts", "z-file.ts"]);
  });

  it("rejects traversal that escapes the current project", async () => {
    const fm = await loadModule();

    expect(() => fm.writeFile("test-project", "../escape/evil.ts", "malicious")).toThrow(
      /escapes allowed root/i
    );

    const escapedPath = path.join(fm.getWorkspaceRoot(), "escape", "evil.ts");
    expect(fs.existsSync(escapedPath)).toBe(false);
  });

  it("rejects absolute file paths", async () => {
    const fm = await loadModule();

    expect(() => fm.writeFile("test-project", path.resolve("D:/evil.ts"), "malicious")).toThrow(
      /invalid file path/i
    );
  });

  it("rejects invalid project names", async () => {
    const fm = await loadModule();
    expect(() => fm.getProjectPath("../escape")).toThrow(/invalid project name/i);
  });

  it("getWorkspaceRoot returns an absolute path", async () => {
    const fm = await loadModule();
    const root = fm.getWorkspaceRoot();
    expect(path.isAbsolute(root)).toBe(true);
    expect(root).toContain("workspace");
  });
});

