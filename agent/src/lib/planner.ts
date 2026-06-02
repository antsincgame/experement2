// Adds contract-aware plan validation so invalid or unrecoverable planner JSON fails before generation starts.
import { streamCompletion, type CompleteFn } from "../services/llm-proxy.js";
import { AppPlanSchema, type AppPlan } from "../schemas/app-plan.schema.js";
import { SYSTEM_PLANNER } from "../prompts/system-planner.js";
import { validateAppPlan } from "./project-validator.js";
import { safeJsonParse } from "./json-repair.js";
import { stripThinkingFromText } from "./strip-thinking.js";

interface PlannerOptions {
  description: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  lmStudioUrl?: string;
  model?: string;
  /** Model-completion seam; defaults to the real streamCompletion. */
  complete?: CompleteFn;
  onChunk?: (chunk: string) => void;
}

export const planApp = async (options: PlannerOptions): Promise<AppPlan> => {
  const { description, temperature = 0.3, maxTokens = 65536, topP, lmStudioUrl, model, onChunk, complete = streamCompletion } = options;

  const messages = [
    { role: "system" as const, content: SYSTEM_PLANNER },
    { role: "user" as const, content: `/no_think\nCreate an app plan for: ${description}\n\nRespond with ONLY a JSON object. No thinking, no explanation, no markdown.` },
  ];

  let fullJson = "";

  const generator = await complete(messages, {
    temperature,
    maxTokens,
    topP,
    lmStudioUrl,
    model,
    responseFormat: { type: "json_object" },
  });

  let planChunkBuffer = "";
  let planLastSend = Date.now();

  for await (const chunk of generator) {
    fullJson += chunk;
    planChunkBuffer += chunk;
    if (Date.now() - planLastSend > 100) {
      onChunk?.(planChunkBuffer);
      planChunkBuffer = "";
      planLastSend = Date.now();
    }
  }
  if (planChunkBuffer) onChunk?.(planChunkBuffer);

  // Strip reasoning-model blocks (<think>, <thinking>, redacted_thinking) and
  // markdown fences via the shared utility so planner/editor behave identically.
  const trimmed = stripThinkingFromText(fullJson);

  let parsed: unknown;
  try {
    parsed = safeJsonParse(trimmed);
    if (parsed === null) {
      throw new Error("Planner returned unrecoverable JSON");
    }
  } catch (err) {
    throw new Error(
      `Planner returned invalid JSON: ${err instanceof Error ? err.message : "parse error"}\n${trimmed.slice(0, 300)}`
    );
  }

  const result = AppPlanSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`Plan validation failed: ${issues}`);
  }

  const semanticIssues = validateAppPlan(result.data);
  if (semanticIssues.length > 0) {
    throw new Error(
      `Plan validation failed: ${semanticIssues
        .map((issue) => `${issue.filePath ?? "plan"}: ${issue.message}`)
        .join("; ")}`
    );
  }

  return result.data;
};
