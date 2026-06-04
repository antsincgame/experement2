// Persists plan artifacts: brief.md for models, blueprint.json for machines.
import fs from "fs";
import path from "path";
import type { AppPlan } from "../schemas/app-plan.schema.js";
import { getProjectPath } from "../services/file-manager.js";
import { formatPlanBriefForModels } from "@shared/plan-brief.js";

export const PLAN_ARTIFACT_DIR = ".appfactory";
export const PLAN_BLUEPRINT_FILE = "blueprint.json";
export const PLAN_BRIEF_FILE = "blueprint-brief.md";

export const getPlanBlueprintPath = (projectName: string): string =>
  path.join(getProjectPath(projectName), PLAN_ARTIFACT_DIR, PLAN_BLUEPRINT_FILE);

export const getPlanBriefPath = (projectName: string): string =>
  path.join(getProjectPath(projectName), PLAN_ARTIFACT_DIR, PLAN_BRIEF_FILE);

export const savePlanBlueprint = (projectName: string, plan: AppPlan): void => {
  const dir = path.join(getProjectPath(projectName), PLAN_ARTIFACT_DIR);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(getPlanBlueprintPath(projectName), JSON.stringify(plan, null, 2), "utf8");
  fs.writeFileSync(getPlanBriefPath(projectName), formatPlanBriefForModels(plan), "utf8");
};

export const loadPlanBrief = (projectName: string): string | null => {
  const filePath = getPlanBriefPath(projectName);
  if (!fs.existsSync(filePath)) {
    const plan = loadPlanBlueprint(projectName);
    return plan ? formatPlanBriefForModels(plan) : null;
  }
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
};

export const loadPlanBlueprint = (projectName: string): AppPlan | null => {
  const filePath = getPlanBlueprintPath(projectName);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as AppPlan;
  } catch {
    return null;
  }
};
