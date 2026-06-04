// Durable generation checkpoint + plan — single source of truth for resume across projects.
import fs from "fs";
import path from "path";
import type { AppPlan } from "../schemas/app-plan.schema.js";
import { getProjectPath, readFile as readProjectFile } from "../services/file-manager.js";
import { savePlanBlueprint } from "./plan-artifact.js";

const STATE_DIR = ".appfactory";
const STATE_FILE = "generation-state.json";
const LEGACY_PLAN_FILE = "plan.json";
const EOF_MARKER = "// EOF";

export type GenerationCheckpoint =
  | "planned"
  | "scaffolded"
  | "codegen"
  | "shipped";

export interface ProjectGenerationState {
  version: 1;
  plan: AppPlan;
  checkpoint: GenerationCheckpoint;
  savedAt: string;
}

export interface ProjectResumeStatus {
  canResume: boolean;
  hasSavedPlan: boolean;
  checkpoint: GenerationCheckpoint | null;
  missingFileCount: number;
  totalPlanFiles: number;
}

const statePath = (projectName: string): string =>
  path.join(getProjectPath(projectName), STATE_DIR, STATE_FILE);

const legacyPlanPath = (projectName: string): string =>
  path.join(getProjectPath(projectName), STATE_DIR, LEGACY_PLAN_FILE);

const readJson = <T>(filePath: string): T | null => {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    return null;
  }
};

const migrateLegacyPlan = (projectName: string): ProjectGenerationState | null => {
  const legacy = readJson<AppPlan>(legacyPlanPath(projectName));
  if (!legacy) return null;
  const state: ProjectGenerationState = {
    version: 1,
    plan: legacy,
    checkpoint: "scaffolded",
    savedAt: new Date().toISOString(),
  };
  persistState(projectName, state);
  return state;
};

const persistState = (projectName: string, state: ProjectGenerationState): void => {
  const dir = path.join(getProjectPath(projectName), STATE_DIR);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(statePath(projectName), JSON.stringify(state, null, 2), "utf8");
};

export const loadGenerationState = (projectName: string): ProjectGenerationState | null => {
  const current = readJson<ProjectGenerationState>(statePath(projectName));
  if (current?.version === 1 && current.plan) {
    return current;
  }
  return migrateLegacyPlan(projectName);
};

export const saveGenerationState = (
  projectName: string,
  plan: AppPlan,
  checkpoint: GenerationCheckpoint,
): void => {
  savePlanBlueprint(projectName, plan);
  persistState(projectName, {
    version: 1,
    plan,
    checkpoint,
    savedAt: new Date().toISOString(),
  });
};

export const advanceGenerationCheckpoint = (
  projectName: string,
  checkpoint: GenerationCheckpoint,
): void => {
  const state = loadGenerationState(projectName);
  if (!state) return;
  persistState(projectName, { ...state, checkpoint, savedAt: new Date().toISOString() });
};

export const isPlanFileComplete = (content: string | null | undefined): boolean =>
  Boolean(content?.trim() && content.includes(EOF_MARKER));

export const listMissingPlanFiles = (projectName: string, plan: AppPlan): string[] =>
  plan.files
    .filter((file) => !isPlanFileComplete(readProjectFile(projectName, file.path)))
    .map((file) => file.path);

export const getProjectResumeStatus = (projectName: string): ProjectResumeStatus => {
  const state = loadGenerationState(projectName);
  if (!state) {
    return {
      canResume: false,
      hasSavedPlan: false,
      checkpoint: null,
      missingFileCount: 0,
      totalPlanFiles: 0,
    };
  }

  const missing = listMissingPlanFiles(projectName, state.plan);
  const canResume =
    state.checkpoint !== "shipped" &&
    missing.length > 0;

  return {
    canResume,
    hasSavedPlan: true,
    checkpoint: state.checkpoint,
    missingFileCount: missing.length,
    totalPlanFiles: state.plan.files.length,
  };
};

/** @deprecated Use saveGenerationState — kept for incremental migration of call sites. */
export const saveProjectPlan = (projectName: string, plan: AppPlan): void =>
  saveGenerationState(projectName, plan, "planned");

export const loadProjectPlan = (projectName: string): AppPlan | null =>
  loadGenerationState(projectName)?.plan ?? null;
