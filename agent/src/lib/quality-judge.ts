// Opt-in LLM-as-judge quality scorer (Phase 1, tier 2). Behind QUALITY_JUDGE=true.
// Scores a generated app on multiple subjective axes the deterministic score can't see
// (visual polish, idiomatic taste, plan adherence). Local model by default; a stronger
// model can be wired via the "judge" role (model-roles.resolveJudgeModel).
//
// Robust-by-design: mirrors the planner's json_object + safeJsonParse path, and returns
// null on ANY failure (timeout, malformed JSON, empty) so the caller falls back to the
// deterministic score and a generation is never affected.
import { streamCompletion, type CompleteFn } from "../services/llm-proxy.js";
import { collectStream } from "./stream-collect.js";
import { safeJsonParse } from "./json-repair.js";
import { stripThinkingFromText } from "./strip-thinking.js";

export interface JudgeAxes {
  correctness: number;
  idiomatic: number;
  completeness: number;
  visual: number;
  planAdherence: number;
}

export interface JudgeResult {
  axes: JudgeAxes;
  /** Mean of the five axes, 0..100. */
  overall: number;
  rationale: string;
}

const AXIS_KEYS: (keyof JudgeAxes)[] = [
  "correctness",
  "idiomatic",
  "completeness",
  "visual",
  "planAdherence",
];

const MAX_JUDGE_FILES = 3;
const MAX_FILE_CHARS = 2200;

const SYSTEM_JUDGE = `You are a STRICT senior React Native (Expo Router + Tamagui + "@/ui") code reviewer.
You will see an app's intent and a few of its generated files. Rate the app on FIVE axes, each 0-100:
- correctness: will it run and behave as intended (no obvious bugs / undefined access / wrong APIs)?
- idiomatic: uses "@/ui" primitives + Tamagui inline props, expo-router, the @/services/db layer; NOT raw react-native View/Text/StyleSheet.
- completeness: real interactivity, empty/loading/error states, no stub/placeholder screens.
- visual: premium polish — spacing rhythm, type hierarchy, cards/elevation, press feedback (not a flat wireframe).
- planAdherence: covers the features the description implies.

Respond with ONLY a single JSON object, no prose, no markdown:
{"correctness":N,"idiomatic":N,"completeness":N,"visual":N,"planAdherence":N,"rationale":"one short sentence"}`;

const clamp01to100 = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
};

export const judgeProject = async (input: {
  plan: { displayName?: string; description?: string };
  files: { path: string; content: string }[];
  complete?: CompleteFn;
  model?: string;
  lmStudioUrl?: string;
}): Promise<JudgeResult | null> => {
  const complete = input.complete ?? streamCompletion;

  const sampled = input.files
    .filter((f) => /\.(tsx|jsx)$/.test(f.path) || /\/stores\//.test(f.path))
    .slice(0, MAX_JUDGE_FILES);
  const filesBlock = (sampled.length > 0 ? sampled : input.files.slice(0, MAX_JUDGE_FILES))
    .map((f) => `// === ${f.path} ===\n${f.content.slice(0, MAX_FILE_CHARS)}`)
    .join("\n\n");

  const userMessage = `App: ${input.plan.displayName ?? "App"}
Intent: ${input.plan.description ?? "(none)"}

Generated files:
${filesBlock}

Rate the app now. Output ONLY the JSON object.`;

  try {
    const gen = await complete(
      [
        { role: "system", content: SYSTEM_JUDGE },
        { role: "user", content: `/no_think\n${userMessage}` },
      ],
      {
        temperature: 0.1,
        maxTokens: 1024,
        model: input.model,
        lmStudioUrl: input.lmStudioUrl,
        responseFormat: { type: "json_object" },
      },
    );
    const raw = await collectStream(gen);
    const parsed = safeJsonParse(stripThinkingFromText(raw, { preferJson: true })) as
      | Record<string, unknown>
      | null;
    if (!parsed) return null;

    const axes = {
      correctness: clamp01to100(parsed.correctness),
      idiomatic: clamp01to100(parsed.idiomatic),
      completeness: clamp01to100(parsed.completeness),
      visual: clamp01to100(parsed.visual),
      planAdherence: clamp01to100(parsed.planAdherence),
    } satisfies JudgeAxes;

    // Reject an all-zero parse (model emitted JSON but no usable axis) → fall back.
    if (AXIS_KEYS.every((k) => axes[k] === 0)) return null;

    const overall = Math.round(AXIS_KEYS.reduce((sum, k) => sum + axes[k], 0) / AXIS_KEYS.length);
    const rationale = typeof parsed.rationale === "string" ? parsed.rationale.slice(0, 240) : "";
    return { axes, overall, rationale };
  } catch {
    return null;
  }
};
