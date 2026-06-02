// Integration-test harness for the filesystem boundary.
//
// file-manager's WORKSPACE_ROOT is a hardcoded module constant (it cannot be
// pointed elsewhere), so integration tests run against the REAL workspace under a
// unique, sandboxed project name and clean up afterwards. getProjectPath already
// sandboxes the name beneath the workspace root, so this cannot escape it.
import fs from "fs";
import { getProjectPath } from "../services/file-manager.js";

/** A unique, collision-resistant project name for one integration test run. */
export const makeTempProjectName = (prefix = "it"): string =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** Recursively remove a temp project directory created during a test. */
export const removeTempProject = (projectName: string): void => {
  fs.rmSync(getProjectPath(projectName), { recursive: true, force: true });
};
