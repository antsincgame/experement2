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
 * Bolt.new-style design brief for the chat reasoning bubble — first-person,
 * conversational, screen-by-screen story. Uses the model's own descriptions
 * (no extra LLM call).
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

  const lines: string[] = [
    "**Here's the blueprint I'm locking in.**",
    "",
    `**${plan.displayName}** — ${firstSentence(plan.description, 160)}`,
    "",
    `I'm going for a **${themeStyle}** feel with **${navType}** navigation.`,
  ];

  const scope: string[] = [];
  if (screens.length > 0) {
    scope.push(`**${screens.length}** screen${screens.length > 1 ? "s" : ""}`);
  }
  if (components.length > 0) {
    scope.push(
      `**${components.length}** UI piece${components.length > 1 ? "s" : ""} you can reuse`,
    );
  }
  if (stores.length > 0) {
    scope.push(`**${stores.length}** Zustand store${stores.length > 1 ? "s" : ""}`);
  }
  if (hooks.length > 0) {
    scope.push(`**${hooks.length}** hook${hooks.length > 1 ? "s" : ""}`);
  }
  if (scope.length > 0) {
    lines.push("", `On the board: ${scope.join(", ")}.`);
  }

  if (screens.length > 0) {
    lines.push("", "**How you'll move through the app:**");
    for (const screen of screens) {
      lines.push(`• **${fileLabel(screen.path)}** — ${firstSentence(screen.description)}`);
    }
  }

  if (components.length > 0) {
    const names = components.map((f) => `**${fileLabel(f.path)}**`).join(", ");
    lines.push("", `Shared UI: ${names}.`);
  }

  if (stores.length > 0 || hooks.length > 0) {
    const state = [...stores, ...hooks].map((f) => `\`${fileLabel(f.path)}\``).join(", ");
    lines.push("", `State & logic live in ${state}.`);
  }

  if (plan.extraDependencies.length > 0) {
    lines.push("", `Pulling in **${plan.extraDependencies.join("**, **")}** where it helps.`);
  }

  lines.push(
    "",
    "**What happens next (you'll see it in the chat):**",
    "1. I lock this blueprint and scaffold the Expo + Tamagui shell.",
    "2. I write every file in order — you'll get a bubble per file with what I'm building.",
    "3. Contract check → quality gates → Metro preview you can click.",
    "",
    `That's **${plan.files.length} files** on the board. The timeline below is the live script.`,
  );
  return lines.join("\n");
};

/**
 * Auto-heal the plan: for every src/ or app/ dependency referenced by a planned
 * file but missing from plan.files, append an inferred file entry. Mutates
 * plan.files in place, matching the original pipeline behavior.
 */
const inferPlanFileType = (dep: string): AppPlan["files"][number]["type"] => {
  if (dep.includes("/hooks/")) return "hook";
  if (dep.includes("/stores/")) return "store";
  if (dep.includes("/types/") || dep.includes("/lib/")) return "type";
  if (dep.startsWith("app/")) return "screen";
  return "component";
};

const defaultDepsForInferredFile = (
  dep: string,
  inferredType: AppPlan["files"][number]["type"],
  planFilePaths: Set<string>,
): string[] => {
  if (inferredType === "type") return [];
  const typesPath = "src/types/index.ts";
  if (dep === typesPath || !planFilePaths.has(typesPath)) return [];
  return [typesPath];
};

/**
 * Auto-heal the plan: for every src/ or app/ dependency referenced by a planned
 * file but missing from plan.files, append an inferred file entry. Mutates
 * plan.files in place. Runs in a loop so transitive references are covered.
 */
export const autoHealPlanDependencies = (plan: AppPlan): void => {
  const planFilePaths = new Set(plan.files.map((f) => f.path));
  let added = true;

  while (added) {
    added = false;
    for (const file of [...plan.files]) {
      for (const dep of file.dependencies) {
        if (!dep.startsWith("src/") && !dep.startsWith("app/")) continue;
        if (planFilePaths.has(dep)) continue;

        const inferredType = inferPlanFileType(dep);
        plan.files.push({
          path: dep,
          type: inferredType,
          description: `Auto-added: referenced by ${file.path}`,
          dependencies: defaultDepsForInferredFile(dep, inferredType, planFilePaths),
        });
        planFilePaths.add(dep);
        added = true;
      }
    }
  }
};
