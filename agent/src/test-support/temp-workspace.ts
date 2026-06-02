// Integration-test harness for the filesystem boundary.
//
// file-manager's WORKSPACE_ROOT is a hardcoded module constant (it cannot be
// pointed elsewhere), so integration tests run against the REAL workspace under a
// unique, sandboxed project name and clean up afterwards. getProjectPath already
// sandboxes the name beneath the workspace root, so this cannot escape it.
import fs from "fs";
import { getProjectPath } from "../services/file-manager.js";

// The "vitest-" prefix marks these as throwaway test projects: it cannot collide
// with a real app slug (plan names are slugified and never start with "vitest-")
// and it is gitignored (workspace/vitest-*), so running the suite in a
// non-isolated environment (e.g. Cursor on a dev machine) cannot pollute the real
// workspace or git status even if a run is interrupted before cleanup.
export const makeTempProjectName = (label = "tmp"): string =>
  `vitest-${label}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** Recursively remove a temp project directory created during a test. */
export const removeTempProject = (projectName: string): void => {
  fs.rmSync(getProjectPath(projectName), { recursive: true, force: true });
};
