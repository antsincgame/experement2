// Pure, testable sub-logic extracted verbatim from the createProject orchestrator
// so plan auto-healing, slug de-duplication, and output summarizing can be
// verified without spawning Metro/git/the LLM. Behavior must match the inline
// originals exactly — these are covered by pipeline-helpers.test.ts.
import type { AppPlan } from "../schemas/app-plan.schema.js";

/** Keep only the last 12 lines of a tool's output for compact error reporting. */
export const summarizeOutput = (output: string): string =>
  output.trim().split("\n").slice(-12).join("\n").trim();

/**
 * Resolve a unique project slug by appending -1, -2, ... while `exists` reports a
 * collision. `exists` is injected so this stays testable without the filesystem.
 */
export const dedupeProjectSlug = (
  baseName: string,
  exists: (slug: string) => boolean
): string => {
  let slug = baseName;
  let suffix = 0;
  while (exists(slug)) {
    suffix++;
    slug = `${baseName}-${suffix}`;
  }
  return slug;
};

const fileLabel = (path: string): string => path.split("/").pop() ?? path;

/** First sentence of a description, trimmed to keep the brief scannable. */
const firstSentence = (text: string, max = 110): string => {
  const sentence = text.split(/(?<=[.!?])\s/)[0]?.trim() ?? text.trim();
  return sentence.length > max ? `${sentence.slice(0, max - 1).trimEnd()}…` : sentence;
};

/**
 * Build a warm, human-readable design brief of the plan for the chat "reasoning"
 * bubble, so the user reads it like a senior engineer describing the build —
 * not a raw file list. Per-screen intent comes from the model's own descriptions
 * (zero extra tokens). Keeps the labeled summary lines stable for downstream UI.
 */
export const summarizePlanForChat = (plan: AppPlan): string => {
  const byType = (type: string): AppPlan["files"] =>
    plan.files.filter((f) => f.type === type);
  const screens = byType("screen");
  const components = byType("component");
  const stores = byType("store");
  const hooks = byType("hook");

  const navType = plan.navigation?.type ?? "stack";
  const themeStyle = plan.theme?.style ?? "premium";

  const lines: string[] = [`Planned **${plan.displayName}** — ${plan.description}`];

  // One-line "what we're building" sentence so the brief reads conversationally.
  const pieces: string[] = [`a ${themeStyle} ${navType} app`];
  if (screens.length > 0) pieces.push(`${screens.length} screen${screens.length > 1 ? "s" : ""}`);
  if (components.length > 0) pieces.push(`${components.length} reusable component${components.length > 1 ? "s" : ""}`);
  if (stores.length > 0) pieces.push(`${stores.length} Zustand store${stores.length > 1 ? "s" : ""}`);
  lines.push("", `Building ${pieces.join(", ")}.`, "");

  if (screens.length > 0) {
    lines.push(`Screens (${screens.length}):`);
    for (const screen of screens) {
      lines.push(`• ${fileLabel(screen.path)} — ${firstSentence(screen.description)}`);
    }
  }
  if (components.length > 0) {
    lines.push(`Components (${components.length}): ${components.map((f) => fileLabel(f.path)).join(", ")}`);
  }
  if (stores.length > 0 || hooks.length > 0) {
    const state = [...stores, ...hooks].map((f) => fileLabel(f.path)).join(", ");
    lines.push(`State & logic: ${state}`);
  }
  if (plan.extraDependencies.length > 0) {
    lines.push(`Libraries: ${plan.extraDependencies.join(", ")}`);
  }
  lines.push(`Total: ${plan.files.length} files.`);
  lines.push("", "Scaffolding the project, then writing each file with a live preview as it builds.");
  return lines.join("\n");
};

/**
 * Auto-heal the plan: for every src/ or app/ dependency referenced by a planned
 * file but missing from plan.files, append an inferred file entry. Mutates
 * plan.files in place, matching the original pipeline behavior.
 */
export const autoHealPlanDependencies = (plan: AppPlan): void => {
  const planFilePaths = new Set(plan.files.map((f) => f.path));
  for (const file of [...plan.files]) {
    for (const dep of file.dependencies) {
      if (!dep.startsWith("src/") && !dep.startsWith("app/")) continue;
      if (planFilePaths.has(dep)) continue;
      const inferredType = dep.includes("/hooks/") ? "hook"
        : dep.includes("/stores/") ? "store"
        : dep.includes("/types/") ? "type"
        : dep.includes("/components/") ? "component"
        : dep.includes("/lib/") ? "type"
        : "component";
      plan.files.push({
        path: dep,
        type: inferredType as "hook" | "store" | "type" | "component" | "screen",
        description: `Auto-added: referenced by ${file.path}`,
        dependencies: inferredType === "type" ? [] : ["src/types/index.ts"].filter((t) => planFilePaths.has(t) || dep !== t),
      });
      planFilePaths.add(dep);
    }
  }
};
