// Single source of truth for which LM Studio model each pipeline role uses.
export type PipelineModelRole = "planner" | "generation" | "fix" | "enhance" | "embedding" | "judge";

const trimOptional = (value?: string): string | undefined => {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
};

/** Planner step: dedicated planner model, else generation, else LM Studio auto-pick. */
export const resolvePlannerModel = (
  plannerModel?: string,
  generationModel?: string
): string | undefined => trimOptional(plannerModel) ?? trimOptional(generationModel);

/** Initial file generation only — never used for contract/type/Metro fixes. */
export const resolveGenerationModel = (model?: string): string | undefined =>
  trimOptional(model);

/**
 * All repair paths: contract violations, type-fix loop, Metro autofix, chat iterate.
 * Editor/Fix model when set, otherwise the same fallback as generation.
 */
export const resolveFixModel = (
  editorModel?: string,
  generationModel?: string
): string | undefined => trimOptional(editorModel) ?? trimOptional(generationModel);

/**
 * Quality-judge step (opt-in): a dedicated judge model when set (can be a STRONGER /
 * cloud model for less-biased scoring), else the fix model, else generation, else
 * LM Studio auto-pick. Keeping judging local by default preserves privacy/cost.
 */
export const resolveJudgeModel = (
  judgeModel?: string,
  fixModel?: string,
  generationModel?: string
): string | undefined =>
  trimOptional(judgeModel) ?? trimOptional(fixModel) ?? trimOptional(generationModel);

/** Human-readable label for MoE swap events and settings hints. */
export const formatModelRoleLabel = (
  role: PipelineModelRole,
  model?: string
): string => {
  const resolved = model?.trim() || "Auto";
  const prefixes: Record<PipelineModelRole, string> = {
    planner: "🧠 [MoE] Planner",
    generation: "💻 [MoE] Generation",
    fix: "🔧 [MoE] Editor/Fix",
    enhance: "✨ [MoE] Enhancer",
    embedding: "📎 [MoE] Embedding",
    judge: "⚖️ [MoE] Judge",
  };
  return `${prefixes[role]} (${resolved})`;
};
