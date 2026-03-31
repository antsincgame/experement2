// Adds contract-aware plan validation so invalid or unrecoverable planner JSON fails before generation starts.
import { streamCompletion } from "../services/llm-proxy.js";
import { AppPlanSchema, type AppPlan } from "../schemas/app-plan.schema.js";
import { SYSTEM_PLANNER } from "../prompts/system-planner.js";
import { validateAppPlan } from "./project-validator.js";
import { safeJsonParse } from "./json-repair.js";

interface PlannerOptions {
  description: string;
  temperature?: number;
  maxTokens?: number;
  lmStudioUrl?: string;
  model?: string;
  onChunk?: (chunk: string) => void;
}

export const planApp = async (options: PlannerOptions): Promise<AppPlan> => {
  const { description, temperature = 0.3, maxTokens = 32768, lmStudioUrl, model, onChunk } = options;

  const messages = [
    { role: "system" as const, content: SYSTEM_PLANNER },
    { role: "user" as const, content: `Create an app plan for: ${description}` },
  ];

  let fullJson = "";

  const generator = await streamCompletion(messages, {
    temperature,
    maxTokens,
    lmStudioUrl,
    model,
  });

  for await (const chunk of generator) {
    fullJson += chunk;
    onChunk?.(chunk);
  }

  const trimmed = fullJson.trim();

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
