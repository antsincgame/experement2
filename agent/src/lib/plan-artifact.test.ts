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
});
