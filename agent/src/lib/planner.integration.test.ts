// Integration test: real planApp pipeline (think-block stripping -> JSON repair
// -> schema parse -> semantic validation) with the model injected as a plain
// fake `complete`. No module mocking.
import { describe, it, expect } from "vitest";
import { streamOf } from "../test-support/llm-mock.js";
import { planApp } from "./planner.js";

const validPlan = JSON.stringify({
  name: "todo-app",
  displayName: "Todo App",
  description: "A simple todo app",
  navigation: { type: "stack", screens: [] },
  files: [
    { path: "app/index.tsx", type: "screen", description: "home", dependencies: ["src/types/index.ts"] },
    { path: "src/types/index.ts", type: "type", description: "types", dependencies: [] },
  ],
});

describe("planApp (integration, injected fake model)", () => {
  it("strips <think> blocks, then parses and validates the plan", async () => {
    const plan = await planApp({
      description: "todo",
      complete: async () => streamOf(`<think>designing the app...</think>${validPlan}`),
    });

    expect(plan.name).toBe("todo-app");
    expect(plan.files.map((f) => f.path)).toContain("app/index.tsx");
  });

  it("throws on unrecoverable JSON", async () => {
    await expect(
      planApp({ description: "x", complete: async () => streamOf("this is not json") })
    ).rejects.toThrow(/JSON/);
  });

  it("throws when the plan fails semantic validation (dangling dependency)", async () => {
    const danglingDep = JSON.stringify({
      name: "broken",
      displayName: "Broken",
      description: "x",
      navigation: { type: "stack", screens: [] },
      files: [
        { path: "app/index.tsx", type: "screen", description: "h", dependencies: ["src/missing.ts"] },
      ],
    });

    await expect(
      planApp({ description: "x", complete: async () => streamOf(danglingDep) })
    ).rejects.toThrow(/validation failed/);
  });
});
