import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppPlan } from "../schemas/app-plan.schema.js";

vi.mock("../services/file-manager.js", () => ({
  getProjectPath: (name: string) => path.join(os.tmpdir(), "blueprint-test", name),
}));

import {
  getPlanBriefPath,
  getPlanBlueprintPath,
  loadPlanBlueprint,
  loadPlanBrief,
  savePlanBlueprint,
} from "./plan-artifact.js";

const tmpRoot = path.join(os.tmpdir(), "blueprint-test");

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

const minimalPlan: AppPlan = {
  name: "demo",
  displayName: "Demo",
  description: "Demo app",
  files: [
    { path: "app/index.tsx", type: "screen", description: "Home", dependencies: [] },
  ],
  extraDependencies: [],
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
  navigation: { type: "stack", screens: [] },
};

describe("plan-artifact", () => {
  it("writes blueprint.json under .appfactory", () => {
    savePlanBlueprint("demo", minimalPlan);
    const filePath = getPlanBlueprintPath("demo");
    expect(fs.existsSync(filePath)).toBe(true);
    expect(filePath).toContain(".appfactory");
    expect(filePath).toContain("blueprint.json");
    expect(loadPlanBlueprint("demo")).toEqual(minimalPlan);
    expect(fs.existsSync(getPlanBriefPath("demo"))).toBe(true);
    expect(loadPlanBrief("demo")).toContain("Demo");
  });

  it("strips auto-generated layouts on load and rewrites blueprint.json", () => {
    const dirtyPlan: AppPlan = {
      ...minimalPlan,
      navigation: {
        type: "tabs",
        screens: [{ path: "app/(tabs)/index.tsx", name: "Home", icon: "home-outline" }],
      },
      files: [
        {
          path: "app/(tabs)/_layout.tsx",
          type: "screen",
          description: "tabs layout",
          dependencies: [],
        },
        {
          path: "app/(tabs)/index.tsx",
          type: "screen",
          description: "Home",
          dependencies: ["app/(tabs)/_layout.tsx"],
        },
      ],
    };
    savePlanBlueprint("dirty", dirtyPlan);

    const loaded = loadPlanBlueprint("dirty");
    expect(loaded?.files.map((f) => f.path)).toEqual(["app/(tabs)/index.tsx"]);
    expect(loaded?.files[0].dependencies).toEqual([]);

    const onDisk = JSON.parse(
      fs.readFileSync(getPlanBlueprintPath("dirty"), "utf8"),
    ) as AppPlan;
    expect(onDisk.files.map((f) => f.path)).toEqual(["app/(tabs)/index.tsx"]);
  });
});
