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
