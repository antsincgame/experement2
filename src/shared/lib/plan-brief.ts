// Human-readable plan for chat (Cursor-style); JSON lives in .appfactory/blueprint.json on disk.
export interface PlanFileEntry {
  path: string;
  type: string;
  description: string;
  dependencies?: string[];
}

export interface PlanBriefInput {
  name?: string;
  displayName?: string;
  description?: string;
  files?: PlanFileEntry[];
  extraDependencies?: string[];
  theme?: { style?: string };
  navigation?: { type?: string; screens?: Array<{ name: string; path: string }> };
}

const fileLabel = (path: string): string => path.split("/").pop() ?? path;

const firstSentence = (text: string, max = 110): string => {
  const sentence = text.split(/(?<=[.!?])\s/)[0]?.trim() ?? text.trim();
  return sentence.length > max ? `${sentence.slice(0, max - 1).trimEnd()}…` : sentence;
};

/**
 * Markdown brief shown in the Plan card — mirrors agent summarizePlanForChat.
 */
export const formatPlanBrief = (plan: PlanBriefInput): string => {
  const files = plan.files ?? [];
  const byType = (type: string): PlanFileEntry[] => files.filter((f) => f.type === type);
  const screens = byType("screen");
  const components = byType("component");
  const stores = byType("store");
  const hooks = byType("hook");
  const navType = plan.navigation?.type ?? "stack";
  const themeStyle = plan.theme?.style ?? "premium";
  const displayName = plan.displayName ?? plan.name ?? "App";
  const description = plan.description ?? "";

  const lines: string[] = [
    "**Blueprint**",
    "",
    `**${displayName}** — ${firstSentence(description, 160)}`,
    "",
    `**${themeStyle}** theme · **${navType}** navigation`,
  ];

  const scope: string[] = [];
  if (screens.length > 0) {
    scope.push(`**${screens.length}** screen${screens.length > 1 ? "s" : ""}`);
  }
  if (components.length > 0) {
    scope.push(`**${components.length}** component${components.length > 1 ? "s" : ""}`);
  }
  if (stores.length > 0) {
    scope.push(`**${stores.length}** store${stores.length > 1 ? "s" : ""}`);
  }
  if (hooks.length > 0) {
    scope.push(`**${hooks.length}** hook${hooks.length > 1 ? "s" : ""}`);
  }
  if (scope.length > 0) {
    lines.push("", scope.join(" · "));
  }

  if (screens.length > 0) {
    lines.push("", "**Screens**");
    for (const screen of screens) {
      lines.push(`- **${fileLabel(screen.path)}** — ${firstSentence(screen.description)}`);
    }
  }

  if (components.length > 0) {
    lines.push("", "**Shared UI**");
    for (const component of components) {
      lines.push(`- **${fileLabel(component.path)}** — ${firstSentence(component.description, 90)}`);
    }
  }

  if (stores.length > 0 || hooks.length > 0) {
    lines.push("", "**State & logic**");
    for (const entry of [...stores, ...hooks]) {
      lines.push(`- \`${entry.path}\` — ${firstSentence(entry.description, 90)}`);
    }
  }

  const navScreens = plan.navigation?.screens ?? [];
  if (navScreens.length > 0) {
    lines.push("", "**Navigation**");
    for (const screen of navScreens) {
      lines.push(`- ${screen.name} → \`${screen.path}\``);
    }
  }

  const extras = plan.extraDependencies ?? [];
  if (extras.length > 0) {
    lines.push("", `**Packages:** ${extras.map((d) => `\`${d}\``).join(", ")}`);
  }

  lines.push(
    "",
    `**${files.length} files** in the build queue.`,
    "",
    "*Full narrative for models:* `.appfactory/blueprint-brief.md` · *dependency graph:* `blueprint.json`.",
  );

  return lines.join("\n");
};

export const PLAN_DRAFTING_PLACEHOLDER =
  "**Drafting the blueprint…**\n\n" +
  "Mapping screens, navigation, theme, and product story. " +
  "You'll get a readable brief here; models will read `.appfactory/blueprint-brief.md`, " +
  "tools use `blueprint.json` for the exact file graph.";
