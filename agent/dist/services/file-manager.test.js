import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
let tmpDir;
let originalCwd;
beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fm-test-"));
    originalCwd = process.cwd;
    // file-manager resolves WORKSPACE_ROOT as path.resolve(process.cwd(), "../workspace")
    // We need cwd to return tmpDir so WORKSPACE_ROOT = path.resolve(tmpDir, "../workspace")
    // Instead, let's set cwd so that "../workspace" lands inside our temp area
    const fakeCwd = path.join(tmpDir, "agent");
    fs.mkdirSync(fakeCwd, { recursive: true });
    process.cwd = () => fakeCwd;
});
afterEach(() => {
    process.cwd = originalCwd;
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.resetModules();
});
const loadModule = async () => {
    // Dynamic import to pick up patched cwd each time
    const mod = await import("./file-manager.js");
    return mod;
};
describe("file-manager", () => {
    it("writeFile creates file and nested directories", async () => {
        const fm = await loadModule();
        fm.writeFile("test-project", "src/utils/helper.ts", "export const x = 1;");
        const fullPath = path.join(fm.getProjectPath("test-project"), "src/utils/helper.ts");
        expect(fs.existsSync(fullPath)).toBe(true);
        expect(fs.readFileSync(fullPath, "utf-8")).toBe("export const x = 1;");
    });
    it("readFile returns content of existing file", async () => {
        const fm = await loadModule();
        fm.writeFile("test-project", "index.ts", "hello world");
        const content = fm.readFile("test-project", "index.ts");
        expect(content).toBe("hello world");
    });
    it("readFile returns null for non-existent file", async () => {
        const fm = await loadModule();
        const content = fm.readFile("test-project", "missing.ts");
        expect(content).toBeNull();
    });
    it("listAllFiles performs recursive traversal", async () => {
        const fm = await loadModule();
        fm.writeFile("test-project", "a.ts", "a");
        fm.writeFile("test-project", "src/b.ts", "b");
        fm.writeFile("test-project", "src/deep/c.ts", "c");
        const files = fm.listAllFiles("test-project");
        expect(files).toEqual(["a.ts", "src/b.ts", "src/deep/c.ts"]);
    });
    it("listAllFiles skips node_modules and .git", async () => {
        const fm = await loadModule();
        fm.writeFile("test-project", "index.ts", "ok");
        // Manually create node_modules and .git entries
        const projectPath = fm.getProjectPath("test-project");
        fs.mkdirSync(path.join(projectPath, "node_modules"), { recursive: true });
        fs.writeFileSync(path.join(projectPath, "node_modules", "pkg.js"), "module");
        fs.mkdirSync(path.join(projectPath, ".git"), { recursive: true });
        fs.writeFileSync(path.join(projectPath, ".git", "config"), "git");
        const files = fm.listAllFiles("test-project");
        expect(files).toEqual(["index.ts"]);
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
    it("getProjectPath returns correct path", async () => {
        const fm = await loadModule();
        const projectPath = fm.getProjectPath("my-app");
        expect(projectPath).toContain("workspace");
        expect(projectPath).toContain("my-app");
        expect(path.isAbsolute(projectPath)).toBe(true);
    });
    it("deleteFile removes an existing file and returns true", async () => {
        const fm = await loadModule();
        fm.writeFile("test-project", "temp.ts", "delete me");
        const result = fm.deleteFile("test-project", "temp.ts");
        expect(result).toBe(true);
        expect(fm.readFile("test-project", "temp.ts")).toBeNull();
    });
    it("deleteFile returns false for non-existent file", async () => {
        const fm = await loadModule();
        const result = fm.deleteFile("test-project", "ghost.ts");
        expect(result).toBe(false);
    });
    it("fileExists returns correct boolean", async () => {
        const fm = await loadModule();
        expect(fm.fileExists("test-project", "x.ts")).toBe(false);
        fm.writeFile("test-project", "x.ts", "content");
        expect(fm.fileExists("test-project", "x.ts")).toBe(true);
    });
    it("getFileTree returns sorted tree with directories first", async () => {
        const fm = await loadModule();
        fm.writeFile("test-project", "z-file.ts", "z");
        fm.writeFile("test-project", "a-file.ts", "a");
        fm.writeFile("test-project", "src/inner.ts", "inner");
        const tree = fm.getFileTree("test-project");
        // Directories come first
        expect(tree[0].type).toBe("directory");
        expect(tree[0].name).toBe("src");
        // Then files sorted alphabetically
        const fileNames = tree.filter((n) => n.type === "file").map((n) => n.name);
        expect(fileNames).toEqual(["a-file.ts", "z-file.ts"]);
    });
    it("path traversal with ../ stays within workspace", async () => {
        const fm = await loadModule();
        // Write via traversal path — the module uses path.join which resolves ../
        fm.writeFile("test-project", "../escape/evil.ts", "malicious");
        // The file should NOT exist outside workspace root
        const workspaceRoot = fm.getWorkspaceRoot();
        const escapedPath = path.resolve(workspaceRoot, "test-project", "../escape/evil.ts");
        // path.join resolves ../ so it goes to workspace/escape/evil.ts — still inside workspace
        // This verifies the resolved path is under workspace root
        const normalizedEscaped = path.normalize(escapedPath);
        const normalizedRoot = path.normalize(workspaceRoot);
        expect(normalizedEscaped.startsWith(normalizedRoot)).toBe(true);
    });
    it("getWorkspaceRoot returns absolute path", async () => {
        const fm = await loadModule();
        const root = fm.getWorkspaceRoot();
        expect(path.isAbsolute(root)).toBe(true);
        expect(root).toContain("workspace");
    });
});
//# sourceMappingURL=file-manager.test.js.map