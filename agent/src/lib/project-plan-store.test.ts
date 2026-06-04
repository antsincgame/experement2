import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppPlan } from "../schemas/app-plan.schema.js";

vi.mock("../services/file-manager.js", () => ({
  getProjectPath: (name: string) => path.join(os.tmpdir(), "plan-store-test", name),
  readFile: (projectName: string, filePath: string) => {
    const full = path.join(os.tmpdir(), "plan-store-test", projectName, filePath);
    return fs.existsSync(full) ? fs.readFileSync(full, "utf8") : null;
  },
}));

import {
  getProjectResumeStatus,
  isPlanFileComplete,
  listMissingPlanFiles,
  loadProjectPlan,
  saveProjectPlan,
} from "./generation-state.js";
import { getProjectPath } from "../services/file-manager.js";

const tmpRoot = path.join(os.tmpdir(), "plan-store-test");

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

const minimalPlan = {
  name: "demo",
  displayName: "Demo",
  files: [
    { path: "src/stores/a.ts", type: "store", description: "a", dependencies: [] },
    { path: "app/(tabs)/index.tsx", type: "screen", description: "home", dependencies: [] },
  ],
} as unknown as AppPlan;

describe("project-plan-store", () => {
  it("saves and loads plan json", () => {
    saveProjectPlan("demo", minimalPlan);
    expect(loadProjectPlan("demo")).toEqual(minimalPlan);
  });

  it("lists missing files without EOF marker", () => {
    saveProjectPlan("demo", minimalPlan);
    const storePath = path.join(getProjectPath("demo"), "src/stores/a.ts");
    fs.mkdirSync(path.dirname(storePath), { recursive: true });
    fs.writeFileSync(storePath, "export const x = 1;\n", "utf8");
    const missing = listMissingPlanFiles("demo", minimalPlan);
    expect(missing).toContain("src/stores/a.ts");
    expect(missing).toContain("app/(tabs)/index.tsx");
  });

  it("reports canResume when plan exists and files are missing", () => {
    saveProjectPlan("demo", minimalPlan);
    const status = getProjectResumeStatus("demo");
    expect(status.canResume).toBe(true);
    expect(status.missingFileCount).toBe(2);
  });

  it("detects complete files via EOF marker", () => {
    expect(isPlanFileComplete("code\n// EOF\n")).toBe(true);
    expect(isPlanFileComplete("code only")).toBe(false);
  });
});
