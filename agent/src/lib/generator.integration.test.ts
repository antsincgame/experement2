// Integration test: exercise the real generateFiles orchestration end-to-end
// (real file-manager writes, real ts-morph contract extraction, real plan
// validation and sanitization) with only the LLM boundary scripted. This is the
// first node of the orchestrator safety net described in the architecture review.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AppPlanSchema, type AppPlan } from "../schemas/app-plan.schema.js";
import { getProjectPath, readFile } from "../services/file-manager.js";
import { makeTempProjectName, removeTempProject } from "../test-support/temp-workspace.js";
import { streamOf, type ChatMsg } from "../test-support/llm-mock.js";

const mocks = vi.hoisted(() => ({ streamCompletion: vi.fn() }));
vi.mock("../services/llm-proxy.js", () => ({ streamCompletion: mocks.streamCompletion }));

import { generateFiles } from "./generator.js";

const buildPlan = (): AppPlan =>
  AppPlanSchema.parse({
    name: "calc",
    displayName: "Calc",
    description: "A small calculator",
    navigation: { type: "stack", screens: [] },
    files: [
      { path: "app/index.tsx", type: "screen", description: "home screen", dependencies: ["src/types/index.ts"] },
      { path: "src/types/index.ts", type: "type", description: "shared types", dependencies: [] },
    ],
  });

const responseFor = (filePath: string): string => {
  if (filePath === "app/index.tsx") {
    // Includes a @/src/ alias and a named hook import so we can assert the real
    // sanitizer ran (alias collapse + hook→default import). // EOF avoids the
    // truncation-continuation path.
    return [
      "filepath: app/index.tsx",
      `import { useThing } from "@/hooks/useThing";`,
      `import type { T } from "@/src/types";`,
      "export default function Home() { return null; }",
      "// EOF",
    ].join("\n");
  }
  return `filepath: ${filePath}\nexport interface T { a: number }\n// EOF`;
};

describe("generateFiles (integration, scripted LLM)", () => {
  let projectName: string;
  const requested: string[] = [];

  beforeEach(() => {
    projectName = makeTempProjectName("it-gen");
    requested.length = 0;
    mocks.streamCompletion.mockImplementation(async (messages: ChatMsg[]) => {
      const user = messages.filter((m) => m.role === "user").map((m) => m.content).join("\n");
      const match = user.match(/Generate the complete code for:\s*(\S+)/);
      const filePath = match?.[1] ?? "";
      requested.push(filePath);
      return streamOf(responseFor(filePath));
    });
  });

  afterEach(() => {
    removeTempProject(projectName);
    vi.clearAllMocks();
  });

  it("scaffolds the layout and writes every planned file", async () => {
    const plan = buildPlan();
    const files = await generateFiles({
      projectName,
      projectPath: getProjectPath(projectName),
      plan,
    });

    expect(files).toContain("app/_layout.tsx"); // auto-generated stack layout
    expect(files).toContain("src/types/index.ts");
    expect(files).toContain("app/index.tsx");
  });

  it("generates dependencies before their consumers (type before screen)", async () => {
    const plan = buildPlan();
    await generateFiles({ projectName, projectPath: getProjectPath(projectName), plan });

    expect(requested).toEqual(["src/types/index.ts", "app/index.tsx"]);
  });

  it("runs the real sanitizer on generated code (alias collapse + hook import fix)", async () => {
    const plan = buildPlan();
    await generateFiles({ projectName, projectPath: getProjectPath(projectName), plan });

    const screen = readFile(projectName, "app/index.tsx") ?? "";
    expect(screen).toContain(`import useThing from "@/hooks/useThing"`); // named → default
    expect(screen).toContain(`from "@/types"`); // @/src/ collapsed
    expect(screen).not.toContain("@/src/");
  });
});
