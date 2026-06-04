// Integration test: exercise the real editProject (iteration path) end-to-end —
// real file reads/writes, real stream parsing, real search/replace. The model is
// supplied via the injected `complete` function (no module mocking). The two
// model calls (analyze, generate) are told apart by the "Target files:" marker
// the generate prompt carries. Callbacks are recorded with plain arrays.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { CompleteFn } from "../services/llm-proxy.js";
import { writeFile, readFile, fileExists } from "../services/file-manager.js";
import { makeTempProjectName, removeTempProject } from "../test-support/temp-workspace.js";
import { streamOf } from "../test-support/llm-mock.js";
import { editProject } from "./editor.js";

type Analysis = {
  thinking: string;
  action: "read_files" | "no_changes_needed" | "install_package";
  files: string[];
  newFiles: never[];
  filesToDelete: string[];
  newDependencies: string[];
};

const analysis = (overrides: Partial<Analysis>): Analysis => ({
  thinking: "t",
  action: "read_files",
  files: [],
  newFiles: [],
  filesToDelete: [],
  newDependencies: [],
  ...overrides,
});

const searchReplace = (filepath: string, search: string, replace: string): string =>
  ["filepath: " + filepath, "<<<<<<< SEARCH", search, "=======", replace, ">>>>>>> REPLACE"].join("\n");

// Injected model: returns the generate stream when the prompt carries target
// files, otherwise the analysis JSON.
const modelFrom = (analysisObj: Analysis, generateStream: string): CompleteFn =>
  async (messages) => {
    const user = messages.filter((m) => m.role === "user").map((m) => m.content).join("\n");
    return streamOf(user.includes("Target files:") ? generateStream : JSON.stringify(analysisObj));
  };

describe("editProject (integration, injected fake model)", () => {
  let projectName: string;

  beforeEach(() => {
    projectName = makeTempProjectName("it-edit");
  });

  afterEach(() => removeTempProject(projectName));

  it("applies a SEARCH/REPLACE edit to a target file", async () => {
    writeFile(projectName, "app/index.tsx", `export default function Home() { return "Hello"; }`);

    const blocks: { filepath: string }[] = [];
    const analyses: unknown[] = [];

    const result = await editProject({
      projectName,
      userRequest: "change the greeting",
      chatHistory: [],
      onBlock: (b) => blocks.push(b),
      onAnalysis: (a) => analyses.push(a),
      complete: modelFrom(
        analysis({ action: "read_files", files: ["app/index.tsx"] }),
        searchReplace("app/index.tsx", "Hello", "Goodbye")
      ),
    });

    expect(result.appliedBlocks).toBe(1);
    expect(result.failedBlocks).toBe(0);
    const after = readFile(projectName, "app/index.tsx") ?? "";
    expect(after).toContain("Goodbye");
    expect(after).not.toContain("Hello");
    expect(analyses).toHaveLength(1);
    expect(blocks).toHaveLength(1);
  });

  it("makes no changes and skips generation when the analysis says so", async () => {
    const seed = `export default function Home() { return null; }`;
    writeFile(projectName, "app/index.tsx", seed);

    let calls = 0;
    const result = await editProject({
      projectName,
      userRequest: "do nothing",
      chatHistory: [],
      complete: async () => {
        calls++;
        return streamOf(JSON.stringify(analysis({ action: "no_changes_needed" })));
      },
    });

    expect(result.appliedBlocks).toBe(0);
    expect(readFile(projectName, "app/index.tsx")).toBe(seed);
    expect(calls).toBe(1); // only the analyze call — generation is skipped
  });

  it("creates files listed in newFiles by surfacing them to the generate step", async () => {
    writeFile(projectName, "app/index.tsx", `export default function Home() { return null; }`);

    const analysisObj = {
      thinking: "t",
      action: "read_files" as const,
      files: ["app/index.tsx"],
      newFiles: [{ path: "src/components/SearchBar.tsx", description: "A search input" }],
      filesToDelete: [],
      newDependencies: [],
    };
    const newFileBlock = [
      "filepath: src/components/SearchBar.tsx",
      "```tsx",
      "export const SearchBar = () => null;",
      "```",
    ].join("\n");

    let generateSawNewFile = false;
    const complete: CompleteFn = async (messages) => {
      const user = messages.filter((m) => m.role === "user").map((m) => m.content).join("\n");
      if (user.includes("Target files:")) {
        generateSawNewFile = user.includes("src/components/SearchBar.tsx");
        return streamOf(newFileBlock);
      }
      return streamOf(JSON.stringify(analysisObj));
    };

    const result = await editProject({
      projectName,
      userRequest: "add a search bar",
      chatHistory: [],
      complete,
    });

    // The generate prompt must carry the planned new file, and it must be written.
    expect(generateSawNewFile).toBe(true);
    expect(fileExists(projectName, "src/components/SearchBar.tsx")).toBe(true);
    expect(readFile(projectName, "src/components/SearchBar.tsx") ?? "").toContain("SearchBar");
    expect(result.appliedBlocks).toBeGreaterThanOrEqual(1);
  });

  it("deletes files the analysis flags in filesToDelete", async () => {
    writeFile(projectName, "src/old.ts", "export const x = 1;");

    const result = await editProject({
      projectName,
      userRequest: "remove the old module",
      chatHistory: [],
      complete: modelFrom(analysis({ action: "read_files", files: [], filesToDelete: ["src/old.ts"] }), ""),
    });

    expect(fileExists(projectName, "src/old.ts")).toBe(false);
    expect(result.appliedBlocks).toBe(1);
  });
});
