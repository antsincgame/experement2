// Resume interrupted generation from durable checkpoint state.
import fs from "fs";
import type { AppPlan } from "../schemas/app-plan.schema.js";
import { getProjectPath } from "../services/file-manager.js";
import {
  getProjectResumeStatus,
  loadGenerationState,
} from "./generation-state.js";
import {
  executeCodegenRun,
  type GenerationModelOptions,
} from "./generation-run.js";
import {
  createDefaultContext,
  type PipelineContext,
} from "./pipeline-types.js";
import type { CodegenShipResult } from "./pipeline-codegen-phase.js";

export class ResumeGenerationError extends Error {
  constructor(
    readonly code: "NO_STATE" | "NOT_RESUMABLE" | "NO_PROJECT",
    message: string,
  ) {
    super(message);
    this.name = "ResumeGenerationError";
  }
}

export const resumeProjectGeneration = async (
  options: GenerationModelOptions & { projectName: string },
  ctx: PipelineContext = createDefaultContext(),
): Promise<CodegenShipResult> => {
  const { projectName } = options;
  const state = loadGenerationState(projectName);

  if (!state) {
    throw new ResumeGenerationError(
      "NO_STATE",
      `No saved generation state for "${projectName}". Create the project again.`,
    );
  }

  const resume = getProjectResumeStatus(projectName);
  if (!resume.canResume) {
    throw new ResumeGenerationError(
      "NOT_RESUMABLE",
      `"${projectName}" is not resumable (checkpoint: ${resume.checkpoint ?? "none"}).`,
    );
  }

  const projectPath = getProjectPath(projectName);
  if (!fs.existsSync(projectPath)) {
    throw new ResumeGenerationError(
      "NO_PROJECT",
      `Project folder "${projectName}" not found on disk.`,
    );
  }

  return executeCodegenRun({
    ...options,
    projectPath,
    plan: state.plan,
    description: state.plan.description ?? state.plan.displayName ?? projectName,
    ctx,
    mode: "resume",
  });
};

export type { AppPlan };
