// Regression: saving generation state before scaffold rmSync wiped .appfactory (resume/checkpoint lost).
import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it, vi } from "vitest";
import type { AppPlan } from "../schemas/app-plan.schema.js";

const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "af-state-"));

vi.mock("../services/file-manager.js", () => ({
  getProjectPath: (name: string) => path.join(workspaceRoot, name),
  readFile: () => null,
  writeFile: () => undefined,
}));

const { saveGenerationState, loadGenerationState } = await import("./generation-state.js");

const minimalPlan: AppPlan = {
  name: "state-survivor",
  displayName: "State Survivor",
  description: "test",
  theme: "default",
  navigation: { type: "tabs", screens: [] },
  files: [
    {
      path: "app/(tabs)/index.tsx",
      type: "screen",
      description: "home",
      dependencies: [],
    },
  ],
  extraDependencies: [],
};

describe("generation state vs scaffold rmSync", () => {
  it("loses state when saved before directory wipe (old bug)", () => {
    const slug = `before-wipe-${Date.now()}`;
    const projectPath = path.join(workspaceRoot, slug);
    fs.mkdirSync(projectPath, { recursive: true });

    saveGenerationState(slug, minimalPlan, "planned");
    fs.rmSync(projectPath, { recursive: true, force: true });

    expect(loadGenerationState(slug)).toBeNull();
  });

  it("keeps state when saved after directory wipe (fixed order)", () => {
    const slug = `after-wipe-${Date.now()}`;
    const projectPath = path.join(workspaceRoot, slug);
    fs.mkdirSync(projectPath, { recursive: true });
    fs.rmSync(projectPath, { recursive: true, force: true });
    fs.mkdirSync(projectPath, { recursive: true });

    saveGenerationState(slug, { ...minimalPlan, name: slug }, "scaffolded");

    const loaded = loadGenerationState(slug);
    expect(loaded?.checkpoint).toBe("scaffolded");
    expect(loaded?.plan.name).toBe(slug);
  });
});
