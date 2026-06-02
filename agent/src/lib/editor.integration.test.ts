// Integration test: exercise the real editProject (iteration path) end-to-end —
// real file reads/writes, real stream parsing, real search/replace application —
// with only the LLM boundary scripted. The two model calls (analyze, generate)
// are told apart by the "Target files:" marker the generate prompt carries.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { writeFile, readFile, fileExists } from "../services/file-manager.js";
import { makeTempProjectName, removeTempProject } from "../test-support/temp-workspace.js";
import { streamOf, type ChatMsg } from "../test-support/llm-mock.js";

const mocks = vi.hoisted(() => ({ streamCompletion: vi.fn() }));
vi.mock("../services/llm-proxy.js", () => ({ streamCompletion: mocks.streamCompletion }));

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

const setLlm = (analysisObj: Analysis, generateStream: string): void => {
  mocks.streamCompletion.mockImplementation(async (messages: ChatMsg[]) => {
    const user = messages.filter((m) => m.role === "user").map((m) => m.content).join("\n");
    if (user.includes("Target files:")) return streamOf(generateStream);
    return streamOf(JSON.stringify(analysisObj));
  });
};

const searchReplace = (filepath: string, search: string, replace: string): string =>
  ["filepath: " + filepath, "<<<<<<< SEARCH", search, "=======", replace, ">>>>>>> REPLACE"].join("\n");

describe("editProject (integration, scripted LLM)", () => {
  let projectName: string;

  beforeEach(() => {
    projectName = makeTempProjectName("it-edit");
  });

  afterEach(() => {
    removeTempProject(projectName);
    vi.clearAllMocks();
  });

  it("applies a SEARCH/REPLACE edit to a target file", async () => {
    writeFile(projectName, "app/index.tsx", `export default function Home() { return "Hello"; }`);
    setLlm(
      analysis({ action: "read_files", files: ["app/index.tsx"] }),
      searchReplace("app/index.tsx", "Hello", "Goodbye")
    );

    const onBlock = vi.fn();
    const onAnalysis = vi.fn();
    const result = await editProject({
      projectName,
      userRequest: "change the greeting",
      chatHistory: [],
      onBlock,
      onAnalysis,
    });

    expect(result.appliedBlocks).toBe(1);
    expect(result.failedBlocks).toBe(0);
    const after = readFile(projectName, "app/index.tsx") ?? "";
    expect(after).toContain("Goodbye");
    expect(after).not.toContain("Hello");
    expect(onAnalysis).toHaveBeenCalledTimes(1);
    expect(onBlock).toHaveBeenCalledTimes(1);
  });

  it("makes no changes and skips generation when the analysis says so", async () => {
    const seed = `export default function Home() { return null; }`;
    writeFile(projectName, "app/index.tsx", seed);
    setLlm(analysis({ action: "no_changes_needed" }), "");

    const result = await editProject({ projectName, userRequest: "do nothing", chatHistory: [] });

    expect(result.appliedBlocks).toBe(0);
    expect(readFile(projectName, "app/index.tsx")).toBe(seed);
    // Only the analyze call should fire — generation is skipped.
    expect(mocks.streamCompletion).toHaveBeenCalledTimes(1);
  });

  it("deletes files the analysis flags in filesToDelete", async () => {
    writeFile(projectName, "src/old.ts", "export const x = 1;");
    setLlm(analysis({ action: "read_files", files: [], filesToDelete: ["src/old.ts"] }), "");

    const result = await editProject({ projectName, userRequest: "remove the old module", chatHistory: [] });

    expect(fileExists(projectName, "src/old.ts")).toBe(false);
    expect(result.appliedBlocks).toBe(1);
  });
});
