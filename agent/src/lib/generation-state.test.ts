// Migration: generation-state and legacy plan.json strip auto-generated layouts on load.
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppPlan } from "../schemas/app-plan.schema.js";

vi.mock("../services/file-manager.js", () => ({
  getProjectPath: (name: string) => path.join(os.tmpdir(), "gen-state-test", name),
  readFile: () => null,
}));

import {
  isPlanFileComplete,
  isStructurallyComplete,
  loadGenerationState,
  saveGenerationState,
} from "./generation-state.js";
import { getPlanBlueprintPath } from "./plan-artifact.js";

const tmpRoot = path.join(os.tmpdir(), "gen-state-test");

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

const tabsPlan: AppPlan = {
  name: "buddy",
  displayName: "Buddy",
  description: "Dating app",
  extraDependencies: [],
  files: [
    {
      path: "app/(tabs)/_layout.tsx",
      type: "screen",
      description: "layout",
      dependencies: [],
    },
    {
      path: "app/(tabs)/index.tsx",
      type: "screen",
      description: "Discover",
      dependencies: ["app/(tabs)/_layout.tsx"],
    },
  ],
  theme: {
    style: "premium",
    background: "#fff",
    surface: "#fff",
    primary: "#000",
    primaryText: "#000",
    secondaryText: "#666",
    accent: "#00f",
    cardRadius: 12,
    buttonRadius: 8,
    isDark: false,
  },
  navigation: {
    type: "tabs",
    screens: [{ path: "app/(tabs)/index.tsx", name: "Discover", icon: "compass-outline" }],
  },
};

describe("loadGenerationState", () => {
  it("migrates saved state by stripping layouts and syncing blueprint.json", () => {
    saveGenerationState("buddy", tabsPlan, "codegen");

    const state = loadGenerationState("buddy");
    expect(state?.plan.files.map((f) => f.path)).toEqual(["app/(tabs)/index.tsx"]);

    const blueprint = JSON.parse(
      fs.readFileSync(getPlanBlueprintPath("buddy"), "utf8"),
    ) as AppPlan;
    expect(blueprint.files.map((f) => f.path)).toEqual(["app/(tabs)/index.tsx"]);
  });
});

describe("isStructurallyComplete / isPlanFileComplete", () => {
  const completeScreen = [
    'import { YStack, Text } from "@/ui";',
    "export default function Home() {",
    "  return <YStack><Text>Hi</Text></YStack>;",
    "}",
  ].join("\n");

  it("treats a complete file WITHOUT an // EOF marker as complete", () => {
    expect(completeScreen.includes("// EOF")).toBe(false);
    expect(isStructurallyComplete(completeScreen)).toBe(true);
    expect(isPlanFileComplete(completeScreen)).toBe(true);
  });

  it("still treats a genuinely truncated file (unbalanced braces) as incomplete", () => {
    const truncated = [
      'import { YStack, Text } from "@/ui";',
      "export default function Home() {",
      "  return <YStack><Text>Hi</Te", // cut off mid-construct
    ].join("\n");
    expect(isStructurallyComplete(truncated)).toBe(false);
    expect(isPlanFileComplete(truncated)).toBe(false);
  });

  it("does not let braces inside strings/comments skew the balance", () => {
    const tricky = [
      'export const msg = "a } b { c";',
      "// a stray } in a comment",
      "export const ok = true;",
    ].join("\n");
    expect(isStructurallyComplete(tricky)).toBe(true);
  });

  it("requires an export (a stray fragment is not complete)", () => {
    expect(isStructurallyComplete("const x = 1; const y = 2; doStuff();")).toBe(false);
  });

  it("does not let braces inside a regex char-class skew the balance (L6)", () => {
    const withRegex = [
      'export const clean = (s: string) => s.replace(/[{}]/g, "");',
      "export default function X() { return null; }",
    ].join("\n");
    expect(isStructurallyComplete(withRegex)).toBe(true);
  });

  it("keeps honoring the // EOF marker", () => {
    expect(isPlanFileComplete("export const x = 1;\n// EOF")).toBe(true);
    expect(isPlanFileComplete("")).toBe(false);
    expect(isPlanFileComplete(null)).toBe(false);
  });
});
