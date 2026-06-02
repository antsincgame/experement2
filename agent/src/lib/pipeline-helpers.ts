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

/**
 * Build a short, human-readable summary of the plan for the chat "reasoning"
 * bubble, so the user sees the planner's intent (screens, components, state)
 * instead of only a raw file list.
 */
export const summarizePlanForChat = (plan: AppPlan): string => {
  const byType = (type: string): AppPlan["files"] =>
    plan.files.filter((f) => f.type === type);
  const screens = byType("screen");
  const components = byType("component");
  const stores = byType("store");
  const hooks = byType("hook");

  const lines: string[] = [`Planned **${plan.displayName}** — ${plan.description}`];
  if (screens.length > 0) {
    lines.push(`Screens (${screens.length}): ${screens.map((f) => f.path).join(", ")}`);
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
