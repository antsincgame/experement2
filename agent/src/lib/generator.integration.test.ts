// Integration test: exercise the real generateFiles orchestration end-to-end
// (real file-manager writes, real ts-morph contract extraction, real plan
// validation and sanitization). The model is supplied via the injected `complete`
// function — no module mocking — so the test reads as "given the model returns X
// for file Y, the generator writes Z". To explore it, ctrl-click generateFiles:
// the `complete` parameter is the seam.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { AppPlanSchema, type AppPlan } from "../schemas/app-plan.schema.js";
import type { CompleteFn } from "../services/llm-proxy.js";
import { getProjectPath, readFile } from "../services/file-manager.js";
import { makeTempProjectName, removeTempProject } from "../test-support/temp-workspace.js";
import { streamOf } from "../test-support/llm-mock.js";
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
    // sanitizer ran (alias collapse + hook->default import). // EOF avoids the
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

describe("generateFiles (integration, injected fake model)", () => {
  let projectName: string;
  const requested: string[] = [];

  // The injected model: picks its reply from the requested file path and records
  // call order. Plain function — assignable to the same type the real model has.
  const fakeComplete: CompleteFn = async (messages) => {
    const user = messages.filter((m) => m.role === "user").map((m) => m.content).join("\n");
    const filePath = user.match(/Generate the complete code for:\s*(\S+)/)?.[1] ?? "";
    requested.push(filePath);
    return streamOf(responseFor(filePath));
  };

  beforeEach(() => {
    projectName = makeTempProjectName("it-gen");
    requested.length = 0;
  });

  afterEach(() => removeTempProject(projectName));

  it("scaffolds the layout and writes every planned file", async () => {
    const files = await generateFiles({
      projectName,
      projectPath: getProjectPath(projectName),
      plan: buildPlan(),
      complete: fakeComplete,
      semanticRagEnabled: false,
    });

    expect(files).toContain("app/_layout.tsx"); // auto-generated stack layout
    expect(files).toContain("src/types/index.ts");
    expect(files).toContain("app/index.tsx");
  });

  it("generates dependencies before their consumers (type before screen)", async () => {
    await generateFiles({
      projectName,
      projectPath: getProjectPath(projectName),
      plan: buildPlan(),
      complete: fakeComplete,
      semanticRagEnabled: false,
    });

    expect(requested).toEqual(["src/types/index.ts", "app/index.tsx"]);
  });

  it("writes an index redirect when the plan ships no root route", async () => {
    const planWithoutIndex = AppPlanSchema.parse({
      name: "ride",
      displayName: "Ride",
      description: "A ride app",
      navigation: {
        type: "stack",
        screens: [{ path: "app/login.tsx", name: "Login", icon: "log-in" }],
      },
      files: [
        { path: "app/login.tsx", type: "screen", description: "login screen", dependencies: [] },
      ],
    });

    const files = await generateFiles({
      projectName,
      projectPath: getProjectPath(projectName),
      plan: planWithoutIndex,
      complete: fakeComplete,
      semanticRagEnabled: false,
    });

    expect(files).toContain("app/index.tsx");
    const index = readFile(projectName, "app/index.tsx") ?? "";
    expect(index).toContain('import { Redirect } from "expo-router"');
    expect(index).toContain('href="/login"');
  });

  it("does NOT overwrite a plan that already provides app/index.tsx", async () => {
    const files = await generateFiles({
      projectName,
      projectPath: getProjectPath(projectName),
      plan: buildPlan(),
      complete: fakeComplete,
      semanticRagEnabled: false,
    });

    expect(files.filter((file) => file === "app/index.tsx")).toHaveLength(1);
    const index = readFile(projectName, "app/index.tsx") ?? "";
    // The model-generated screen, not the redirect stub.
    expect(index).not.toContain('<Redirect href=');
  });

  it("runs the real sanitizer on generated code (alias collapse + hook import fix)", async () => {
    await generateFiles({
      projectName,
      projectPath: getProjectPath(projectName),
      plan: buildPlan(),
      complete: fakeComplete,
      semanticRagEnabled: false,
    });

    const screen = readFile(projectName, "app/index.tsx") ?? "";
    expect(screen).toContain(`import useThing from "@/hooks/useThing"`); // named -> default
    expect(screen).toContain(`from "@/types"`); // @/src/ collapsed
    expect(screen).not.toContain("@/src/");
  });
});
