import { describe, it, expect } from "vitest";
import type { AppPlan } from "../schemas/app-plan.schema.js";
import {
  summarizeOutput,
  dedupeProjectSlug,
  autoHealPlanDependencies,
  summarizePlanForChat,
} from "./pipeline-helpers.js";

type PlanFile = AppPlan["files"][number];

const makePlan = (files: PlanFile[]): AppPlan =>
  ({ name: "test", files } as unknown as AppPlan);

const file = (path: string, dependencies: string[] = []): PlanFile =>
  ({ path, type: "screen", description: path, dependencies } as PlanFile);

describe("summarizePlanForChat", () => {
  it("summarizes screens, components, state and libraries", () => {
    const plan = {
      name: "notes",
      displayName: "Notes",
      description: "A notes app",
      extraDependencies: ["zustand"],
      files: [
        { path: "app/(tabs)/index.tsx", type: "screen", description: "list", dependencies: [] },
        { path: "app/note/[id].tsx", type: "screen", description: "detail", dependencies: [] },
        { path: "src/components/NoteCard.tsx", type: "component", description: "card", dependencies: [] },
        { path: "src/stores/noteStore.ts", type: "store", description: "store", dependencies: [] },
        { path: "src/types/index.ts", type: "type", description: "types", dependencies: [] },
      ],
    } as unknown as AppPlan;

    const summary = summarizePlanForChat(plan);

    expect(summary).toContain("**Notes**");
    expect(summary).toContain("**2** screen");
    expect(summary).toContain("**NoteCard.tsx**");
    expect(summary).toContain("noteStore.ts");
    expect(summary).toContain("**zustand**");
    expect(summary).toContain("**5 files**");
  });

  it("reads as a design brief: a 'Building …' sentence and per-screen intent", () => {
    const plan = {
      name: "notes",
      displayName: "Notes",
      description: "A notes app",
      extraDependencies: ["zustand"],
      theme: { style: "premium" },
      navigation: { type: "tabs", screens: [] },
      files: [
        { path: "app/(tabs)/index.tsx", type: "screen", description: "List of notes with search.", dependencies: [] },
        { path: "src/components/NoteCard.tsx", type: "component", description: "card", dependencies: [] },
        { path: "src/stores/noteStore.ts", type: "store", description: "store", dependencies: [] },
      ],
    } as unknown as AppPlan;

    const summary = summarizePlanForChat(plan);

    expect(summary).toContain("premium");
    expect(summary).toContain("tabs");
    expect(summary).toContain("**index.tsx**");
    expect(summary).toContain("List of notes with search");
    expect(summary).toContain("What happens next");
    expect(summary).toContain("scaffold");
  });
});

describe("summarizeOutput", () => {
  it("trims and keeps only the last 12 lines", () => {
    const many = Array.from({ length: 20 }, (_, i) => `line${i}`).join("\n");
    const out = summarizeOutput(many).split("\n");
    expect(out).toHaveLength(12);
    expect(out[0]).toBe("line8");
    expect(out[11]).toBe("line19");
  });

  it("trims surrounding whitespace for short output", () => {
    expect(summarizeOutput("  a\nb  ")).toBe("a\nb");
  });
});

describe("dedupeProjectSlug", () => {
  it("returns the base name when there is no collision", () => {
    expect(dedupeProjectSlug("calc", () => false)).toBe("calc");
  });

  it("appends an incrementing suffix until a free slug is found", () => {
    const taken = new Set(["calc", "calc-1"]);
    expect(dedupeProjectSlug("calc", (slug) => taken.has(slug))).toBe("calc-2");
  });
});

describe("autoHealPlanDependencies", () => {
  it("adds missing src/ dependencies with inferred types", () => {
    const plan = makePlan([
      file("app/index.tsx", [
        "src/hooks/useThing.ts",
        "src/stores/appStore.ts",
        "src/components/Card.tsx",
        "src/lib/format.ts",
      ]),
    ]);

    autoHealPlanDependencies(plan);

    const byPath = new Map(plan.files.map((f) => [f.path, f.type]));
    expect(byPath.get("src/hooks/useThing.ts")).toBe("hook");
    expect(byPath.get("src/stores/appStore.ts")).toBe("store");
    expect(byPath.get("src/components/Card.tsx")).toBe("component");
    expect(byPath.get("src/lib/format.ts")).toBe("type");
  });

  it("ignores bare module deps and does not duplicate known files", () => {
    const plan = makePlan([
      file("app/index.tsx", ["react", "src/stores/appStore.ts"]),
      file("src/stores/appStore.ts", []),
    ]);

    autoHealPlanDependencies(plan);

    expect(plan.files.some((f) => f.path === "react")).toBe(false);
    expect(plan.files.filter((f) => f.path === "src/stores/appStore.ts")).toHaveLength(1);
  });

  it("marks auto-added files in their description", () => {
    const plan = makePlan([file("app/index.tsx", ["src/types/index.ts"])]);
    autoHealPlanDependencies(plan);
    const added = plan.files.find((f) => f.path === "src/types/index.ts");
    expect(added?.type).toBe("type");
    expect(added?.description).toContain("Auto-added");
  });

  it("heals EmptyState referenced by tabs but omitted from plan.files", () => {
    const plan = makePlan([
      file("src/types/index.ts", []),
      file("app/(tabs)/index.tsx", [
        "src/components/ProfileCard.tsx",
        "src/components/EmptyState.tsx",
      ]),
      file("app/(tabs)/matches.tsx", ["src/components/EmptyState.tsx"]),
      file("src/components/ProfileCard.tsx", ["src/types/index.ts"]),
    ]);

    autoHealPlanDependencies(plan);

    const empty = plan.files.find((f) => f.path === "src/components/EmptyState.tsx");
    expect(empty?.type).toBe("component");
    expect(empty?.dependencies).toContain("src/types/index.ts");
  });
});
