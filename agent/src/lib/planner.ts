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

export interface PlanDepthAssessment {
  thin: boolean;
  reasons: string[];
}

const countByType = (plan: AppPlan, predicate: (path: string, type: string) => boolean): number =>
  plan.files.filter((file) => predicate(file.path, file.type)).length;

/**
 * Flags plans that are too shallow for a non-trivial request. Conservative on
 * purpose: a genuinely simple app (single screen, no list) is NOT flagged, so we
 * never force needless complexity. Triggers a single richer re-plan when a
 * multi-screen app lacks the data layer or reusable components a real product needs.
 */
export const assessPlanDepth = (plan: AppPlan): PlanDepthAssessment => {
  const screens = countByType(plan, (path) => path.startsWith("app/") && /\.(tsx|jsx)$/.test(path));
  const components = countByType(plan, (path) => path.includes("/components/"));
  const stores = countByType(plan, (path) => path.includes("/stores/"));
  const reasons: string[] = [];

  // A multi-screen app with no state layer is almost always a hollow stub.
  if (screens >= 2 && stores === 0) {
    reasons.push("multiple screens but no Zustand store (no real data layer)");
  }
  // Several screens but no reusable components means monolithic, non-composed UI.
  if (screens >= 2 && components === 0) {
    reasons.push("multiple screens but zero reusable components (monolithic UI)");
  }
  // A clearly under-built app for anything beyond a single trivial screen.
  if (screens >= 3 && plan.files.length < 7) {
    reasons.push(`only ${plan.files.length} files for ${screens} screens (too shallow)`);
  }

  return { thin: reasons.length > 0, reasons };
};

const buildDepthFeedback = (reasons: string[]): string =>
  `\n\nYour previous plan was TOO SHALLOW: ${reasons.join("; ")}. ` +
  `Produce a RICHER, more complete plan now: add more screens, real reusable components in src/components/, ` +
  `a proper data layer (src/types + Zustand store with CRUD and derived selectors), and end-to-end flows ` +
  `(list → detail → create → edit → delete → settings) with empty/loading/error states. Aim for 12-20 files.`;

const PLAN_USER_PROMPT = (description: string): string =>
  `/no_think\nCreate an app plan for: ${description}\n\nRespond with ONLY a JSON object. No thinking, no explanation, no markdown.`;

const runPlannerOnce = async (
  options: PlannerOptions,
  userContent: string,
  streamChunks: boolean
): Promise<AppPlan> => {
  const { temperature = 0.3, maxTokens = 65536, topP, lmStudioUrl, model, onChunk, complete = streamCompletion } = options;

  const messages = [
    { role: "system" as const, content: SYSTEM_PLANNER },
    { role: "user" as const, content: userContent },
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
    if (!streamChunks) continue;
    planChunkBuffer += chunk;
    if (Date.now() - planLastSend > 100) {
      onChunk?.(planChunkBuffer);
      planChunkBuffer = "";
      planLastSend = Date.now();
    }
  }
  if (streamChunks && planChunkBuffer) onChunk?.(planChunkBuffer);

  // Strip reasoning-model blocks (<think>, <thinking>, redacted_thinking) and
  // markdown fences via the shared utility so planner/editor behave identically.
  const trimmed = stripThinkingFromText(fullJson);

  const parsed = safeJsonParse(trimmed);
  if (parsed === null) {
    throw new Error(
      `Planner returned invalid JSON: unrecoverable parse error\n${trimmed.slice(0, 300)}`
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

export const planApp = async (options: PlannerOptions): Promise<AppPlan> => {
  const { description } = options;
  const basePrompt = PLAN_USER_PROMPT(description);

  const plan = await runPlannerOnce(options, basePrompt, true);

  // One bounded, silent re-plan if the first plan is hollow. The retry does not
  // stream to the UI (avoids a confusing double plan feed) and falls back to the
  // first plan if it fails, so depth enforcement never breaks a working plan.
  const depth = assessPlanDepth(plan);
  if (!depth.thin) {
    return plan;
  }

  try {
    return await runPlannerOnce(options, basePrompt + buildDepthFeedback(depth.reasons), false);
  } catch {
    return plan;
  }
};
