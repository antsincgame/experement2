// Unit tests for plan-depth assessment and the bounded silent re-plan.
import { describe, it, expect } from "vitest";
import { streamOf } from "../test-support/llm-mock.js";
import { assessPlanDepth, planApp } from "./planner.js";
import type { AppPlan } from "../schemas/app-plan.schema.js";

const makePlan = (files: { path: string; type: string; deps?: string[] }[]): AppPlan => ({
  name: "demo",
  displayName: "Demo",
  description: "x",
  extraDependencies: [],
  theme: {
    style: "premium",
    background: "#fff",
    surface: "#fff",
    primary: "#000",
    primaryText: "#000",
    secondaryText: "#666",
    accent: "#000",
    cardRadius: 20,
    buttonRadius: 28,
    isDark: false,
  },
  navigation: { type: "stack", screens: [] },
  files: files.map((f) => ({ path: f.path, type: f.type, description: "d", dependencies: f.deps ?? [] })),
});

describe("assessPlanDepth", () => {
  it("flags a multi-screen plan with no store", () => {
    const plan = makePlan([
      { path: "app/(tabs)/index.tsx", type: "screen" },
      { path: "app/(tabs)/two.tsx", type: "screen" },
      { path: "src/components/Card.tsx", type: "component" },
    ]);
    const result = assessPlanDepth(plan);
    expect(result.thin).toBe(true);
    expect(result.reasons.join(" ")).toMatch(/no Zustand store/);
  });

  it("flags a multi-screen plan with no reusable components", () => {
    const plan = makePlan([
      { path: "app/(tabs)/index.tsx", type: "screen" },
      { path: "app/(tabs)/two.tsx", type: "screen" },
      { path: "src/stores/s.ts", type: "store" },
    ]);
    const result = assessPlanDepth(plan);
    expect(result.thin).toBe(true);
    expect(result.reasons.join(" ")).toMatch(/zero reusable components/);
  });

  it("flags too few files for several screens", () => {
    const plan = makePlan([
      { path: "app/(tabs)/index.tsx", type: "screen" },
      { path: "app/(tabs)/two.tsx", type: "screen" },
      { path: "app/(tabs)/three.tsx", type: "screen" },
      { path: "src/stores/s.ts", type: "store" },
      { path: "src/components/Card.tsx", type: "component" },
    ]);
    const result = assessPlanDepth(plan);
    expect(result.thin).toBe(true);
    expect(result.reasons.join(" ")).toMatch(/too shallow/);
  });

  it("does NOT flag a genuinely simple single-screen app", () => {
    const plan = makePlan([
      { path: "app/index.tsx", type: "screen" },
      { path: "src/types/index.ts", type: "type" },
    ]);
    expect(assessPlanDepth(plan).thin).toBe(false);
  });

  it("does NOT flag a rich, well-composed app", () => {
    const plan = makePlan([
      { path: "app/(tabs)/index.tsx", type: "screen" },
      { path: "app/(tabs)/insights.tsx", type: "screen" },
      { path: "app/(tabs)/settings.tsx", type: "screen" },
      { path: "src/components/Card.tsx", type: "component" },
      { path: "src/components/Header.tsx", type: "component" },
      { path: "src/stores/store.ts", type: "store" },
      { path: "src/types/index.ts", type: "type" },
    ]);
    expect(assessPlanDepth(plan).thin).toBe(false);
  });

  it("does NOT count auto-generated layouts as screens", () => {
    const plan = makePlan([
      { path: "app/_layout.tsx", type: "screen" },        // auto-generated, not a screen
      { path: "app/(tabs)/_layout.tsx", type: "screen" }, // auto-generated, not a screen
      { path: "app/index.tsx", type: "screen" },          // the only real screen
      { path: "src/types/index.ts", type: "type" },
    ]);
    // Only 1 real screen → must not be flagged thin (no needless re-plan, no hang).
    expect(assessPlanDepth(plan).thin).toBe(false);
  });
});

const thinPlan = JSON.stringify({
  name: "thin",
  displayName: "Thin",
  description: "x",
  navigation: { type: "tabs", screens: [] },
  files: [
    { path: "app/(tabs)/index.tsx", type: "screen", description: "h", dependencies: [] },
    { path: "app/(tabs)/two.tsx", type: "screen", description: "t", dependencies: [] },
  ],
});

const richPlan = JSON.stringify({
  name: "rich",
  displayName: "Rich",
  description: "x",
  navigation: { type: "tabs", screens: [] },
  files: [
    { path: "app/(tabs)/index.tsx", type: "screen", description: "h", dependencies: ["src/types/index.ts"] },
    { path: "app/(tabs)/two.tsx", type: "screen", description: "t", dependencies: ["src/types/index.ts"] },
    { path: "src/components/Card.tsx", type: "component", description: "c", dependencies: [] },
    { path: "src/stores/store.ts", type: "store", description: "s", dependencies: ["src/types/index.ts"] },
    { path: "src/types/index.ts", type: "type", description: "t", dependencies: [] },
  ],
});

describe("planApp re-plan on shallow output", () => {
  it("re-plans once when the first plan is thin and returns the richer plan", async () => {
    let call = 0;
    const plan = await planApp({
      description: "habit tracker",
      complete: async () => {
        call += 1;
        return streamOf(call === 1 ? thinPlan : richPlan);
      },
    });

    expect(call).toBe(2);
    expect(plan.name).toBe("rich");
  });

  it("keeps the first plan when the re-plan fails", async () => {
    let call = 0;
    const plan = await planApp({
      description: "habit tracker",
      complete: async () => {
        call += 1;
        return streamOf(call === 1 ? thinPlan : "not json at all");
      },
    });

    expect(call).toBe(2);
    expect(plan.name).toBe("thin");
  });
});

// Reproduces the "model thought a bit, then everything froze silently" reports:
// when the model emits only reasoning (or nothing usable), the planner must throw
// a clear error rather than return garbage or hang.
describe("planApp surfaces a clear error instead of silently stalling", () => {
  it("throws when the model returns only a thinking block (no JSON)", async () => {
    await expect(
      planApp({
        description: "expense tracker",
        complete: async () => streamOf("<think>Let me design this app...</think>"),
      })
    ).rejects.toThrow(/invalid JSON|parse/i);
  });

  it("throws when the model returns an unclosed thinking block then stops", async () => {
    await expect(
      planApp({
        description: "expense tracker",
        complete: async () => streamOf("<think>still reasoning and then the stream stopped"),
      })
    ).rejects.toThrow(/invalid JSON|parse/i);
  });

  it("throws when the model returns an empty response", async () => {
    await expect(
      planApp({
        description: "expense tracker",
        complete: async () => streamOf(""),
      })
    ).rejects.toThrow(/invalid JSON|parse/i);
  });
});
