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

  it("auto-heals missing EmptyState (and other src/) dependencies", async () => {
    const matchmateLike = JSON.stringify({
      name: "matchmate",
      displayName: "MatchMate",
      description: "dating",
      navigation: {
        type: "tabs",
        screens: [
          { path: "app/(tabs)/index.tsx", name: "Home", icon: "heart" },
          { path: "app/(tabs)/matches.tsx", name: "Matches", icon: "users" },
        ],
      },
      files: [
        { path: "src/types/index.ts", type: "type", description: "types", dependencies: [] },
        {
          path: "app/(tabs)/index.tsx",
          type: "screen",
          description: "home",
          dependencies: ["src/components/EmptyState.tsx"],
        },
        {
          path: "app/(tabs)/matches.tsx",
          type: "screen",
          description: "matches",
          dependencies: ["src/components/EmptyState.tsx"],
        },
      ],
    });

    const plan = await planApp({
      description: "dating",
      complete: async () => streamOf(matchmateLike),
    });

    expect(plan.files.map((f) => f.path)).toContain("src/components/EmptyState.tsx");
  });

  it("auto-heals other missing src/ dependencies", async () => {
    const planWithDanglingDep = JSON.stringify({
      name: "broken",
      displayName: "Broken",
      description: "x",
      navigation: { type: "stack", screens: [] },
      files: [
        { path: "app/index.tsx", type: "screen", description: "h", dependencies: ["src/missing.ts"] },
      ],
    });

    const plan = await planApp({
      description: "x",
      complete: async () => streamOf(planWithDanglingDep),
    });

    expect(plan.files.map((f) => f.path)).toContain("src/missing.ts");
  });

  it("throws when tabs navigation points outside app/(tabs)/", async () => {
    const badTabs = JSON.stringify({
      name: "broken",
      displayName: "Broken",
      description: "x",
      navigation: {
        type: "tabs",
        screens: [{ path: "app/index.tsx", name: "Home", icon: "home" }],
      },
      files: [
        { path: "app/index.tsx", type: "screen", description: "h", dependencies: [] },
      ],
    });

    await expect(
      planApp({ description: "x", complete: async () => streamOf(badTabs) })
    ).rejects.toThrow(/validation failed/);
  });
});
