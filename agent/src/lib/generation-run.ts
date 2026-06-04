// Shared codegen→ship execution for create and resume — one options shape, one code path.
import type { AppPlan } from "../schemas/app-plan.schema.js";
import {
  formatModelRoleLabel,
  resolveFixModel,
  resolveGenerationModel,
} from "./model-roles.js";
import { formatPlanBriefForChat } from "./plan-brief.js";
import { createPipelineEmitter } from "./pipeline-emitter.js";
import type { PipelineContext } from "./pipeline-types.js";
import { runCodegenAndShip, type CodegenShipResult } from "./pipeline-codegen-phase.js";
import { getProjectResumeStatus } from "./generation-state.js";

export interface GenerationModelOptions {
  lmStudioUrl?: string;
  model?: string;
  editorModel?: string;
  embeddingModel?: string;
  semanticRagEnabled?: boolean;
  autoPolishEnabled?: boolean;
  autoPolishMaxPasses?: number;
  polishModel?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  requestId?: string;
}

export interface ExecuteCodegenRunParams extends GenerationModelOptions {
  projectName: string;
  projectPath: string;
  plan: AppPlan;
  description: string;
  ctx: PipelineContext;
  mode: "create" | "resume";
  skipExistingFiles?: boolean;
  gitCommitMessage?: string;
}

const resumeThinking = (
  displayName: string,
  projectName: string,
  missing: number,
  total: number,
  checkpoint: string | null,
): string =>
  [
    "**↻ Resuming generation.**",
    "",
    `Picking up **${displayName}** (\`${projectName}\`) at checkpoint \`${checkpoint ?? "unknown"}\` — **${missing}** of **${total}** planned files still need code.`,
    "",
    "Finished files are skipped; the pipeline then runs the same gates and preview boot as a fresh create.",
  ].join("\n");

export const executeCodegenRun = async (
  params: ExecuteCodegenRunParams,
): Promise<CodegenShipResult> => {
  const {
    projectName,
    projectPath,
    plan,
    description,
    ctx,
    mode,
    lmStudioUrl,
    model,
    editorModel,
    embeddingModel,
    semanticRagEnabled = true,
    autoPolishEnabled = false,
    autoPolishMaxPasses = 2,
    polishModel,
    temperature,
    maxTokens,
    topP,
    requestId,
    skipExistingFiles = mode === "resume",
    gitCommitMessage = mode === "resume"
      ? "v1: resumed generation (build verified)"
      : "v1: initial generation (build verified)",
  } = params;

  const generationModel = resolveGenerationModel(model);
  const fixModel = resolveFixModel(editorModel, model);
  const emitter = createPipelineEmitter(projectName, ctx.broadcast, requestId);

  if (mode === "resume") {
    const resume = getProjectResumeStatus(projectName);
    emitter.emit({
      type: "plan_complete",
      plan: { ...plan, name: projectName },
      planBrief: formatPlanBriefForChat(plan),
      blueprintPath: ".appfactory/blueprint.json",
      briefPath: ".appfactory/blueprint-brief.md",
    });
    emitter.emit({
      type: "thinking",
      content: resumeThinking(
        plan.displayName ?? projectName,
        projectName,
        resume.missingFileCount,
        resume.totalPlanFiles,
        resume.checkpoint,
      ),
    });
  }

  emitter.emit({ type: "status", status: "generating" });
  emitter.emit({
    type: "build_event",
    eventType: "moe_swap",
    message:
      mode === "resume"
        ? `${formatModelRoleLabel("generation", generationModel)} — resume`
        : formatModelRoleLabel("generation", generationModel),
  });

  return runCodegenAndShip({
    projectSlug: projectName,
    projectPath,
    plan: { ...plan, name: projectName },
    description,
    generationModel,
    fixModel,
    lmStudioUrl,
    embeddingModel,
    semanticRagEnabled,
    autoPolishEnabled,
    autoPolishMaxPasses,
    polishModel,
    model,
    temperature,
    maxTokens,
    topP,
    complete: ctx.complete,
    ctx,
    emitOperation: emitter.emit,
    emitBuildScoped: emitter.emitBuildScoped,
    skipExistingFiles,
    gitCommitMessage,
  });
};

