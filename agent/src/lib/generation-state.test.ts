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
