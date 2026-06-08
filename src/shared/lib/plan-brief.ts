// Single source: plan narrative for chat, LLM prompts, and .appfactory/blueprint-brief.md.
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
  theme?: {
    style?: string;
    background?: string;
    surface?: string;
    primary?: string;
    primaryText?: string;
    secondaryText?: string;
    accent?: string;
    cardRadius?: number;
    buttonRadius?: number;
    isDark?: boolean;
  };
  navigation?: {
    type?: string;
    screens?: { name: string; path: string; icon?: string }[];
  };
}

const fileLabel = (path: string): string => path.split("/").pop() ?? path;

const firstSentence = (text: string, max = 110): string => {
  const sentence = text.split(/(?<=[.!?])\s/)[0]?.trim() ?? text.trim();
  return sentence.length > max ? `${sentence.slice(0, max - 1).trimEnd()}…` : sentence;
};

const sectionFiles = (
  title: string,
  files: PlanFileEntry[],
  fullDescriptions: boolean,
): string[] => {
  if (files.length === 0) return [];
  const lines = [`## ${title}`];
  for (const file of files) {
    lines.push(`### \`${file.path}\` (${file.type})`);
    lines.push(fullDescriptions ? file.description : firstSentence(file.description, 200));
    const deps = file.dependencies ?? [];
    if (deps.length > 0) {
      lines.push(`Imports: ${deps.join(", ")}`);
    }
    lines.push("");
  }
  return lines;
};

/**
 * Rich product blueprint for codegen / editor / fix models.
 * Full descriptions on screens + target-adjacent types; JSON stays for validators only.
 */
export const formatPlanBriefForModels = (plan: PlanBriefInput): string => {
  const files = plan.files ?? [];
  const theme = plan.theme;
  const nav = plan.navigation;
  const screens = files.filter((f) => f.type === "screen");
  const components = files.filter((f) => f.type === "component");
  const stores = files.filter((f) => f.type === "store");
  const hooks = files.filter((f) => f.type === "hook");
  const types = files.filter((f) => f.type === "type");
  const other = files.filter(
    (f) => !["screen", "component", "store", "hook", "type"].includes(f.type),
  );
  const displayName = plan.displayName ?? plan.name ?? "App";
  const slug = plan.name ?? "app";

  const lines: string[] = [
    `# ${displayName} (\`${slug}\`)`,
    "",
    "## Vision",
    plan.description ?? "",
    "",
    "## Design system",
    `Style: ${theme?.style ?? "premium"} · ${theme?.isDark ? "dark" : "light"} UI`,
    `Colors: background ${theme?.background}, surface ${theme?.surface}, primary ${theme?.primary}, accent ${theme?.accent}`,
    `Typography: primaryText ${theme?.primaryText}, secondaryText ${theme?.secondaryText}`,
    `Radii: cards ${theme?.cardRadius}px, buttons ${theme?.buttonRadius}px`,
    "",
    "## Navigation",
    `Type: ${nav?.type ?? "stack"}`,
  ];

  for (const screen of nav?.screens ?? []) {
    lines.push(
      `- **${screen.name}** → \`${screen.path}\`${screen.icon ? ` (icon: ${screen.icon})` : ""}`,
    );
  }

  const extraDeps = plan.extraDependencies ?? [];
  if (extraDeps.length > 0) {
    lines.push("", "## Packages", extraDeps.map((d) => `- ${d}`).join("\n"));
  }

  lines.push(
    "",
    "## Build map",
    `${files.length} files total. Follow this narrative first; \`.appfactory/blueprint.json\` is the exact path/dependency graph.`,
    "",
  );

  lines.push(...sectionFiles("Screens (full spec)", screens, true));
  lines.push(...sectionFiles("Reusable components", components, true));
  lines.push(...sectionFiles("State (Zustand)", stores, true));
  lines.push(...sectionFiles("Hooks", hooks, true));
  lines.push(...sectionFiles("Types", types, true));
  lines.push(...sectionFiles("Other", other, true));

  return lines.join("\n").trim();
};

/** Scannable brief for the UI chat card (first-person, no token dump). */
export const formatPlanBriefForChat = (plan: PlanBriefInput): string => {
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
  if (screens.length > 0) scope.push(`**${screens.length}** screen${screens.length > 1 ? "s" : ""}`);
  if (components.length > 0) {
    scope.push(`**${components.length}** component${components.length > 1 ? "s" : ""}`);
  }
  if (stores.length > 0) scope.push(`**${stores.length}** store${stores.length > 1 ? "s" : ""}`);
  if (hooks.length > 0) scope.push(`**${hooks.length}** hook${hooks.length > 1 ? "s" : ""}`);
  if (scope.length > 0) lines.push("", scope.join(" · "));

  if (screens.length > 0) {
    lines.push("", "**Screens**");
    for (const screen of screens) {
      lines.push(`- **${fileLabel(screen.path)}** — ${firstSentence(screen.description)}`);
    }
  }

  if (components.length > 0) {
    lines.push("", "**Shared UI**");
    for (const c of components) {
      lines.push(`- **${fileLabel(c.path)}** — ${firstSentence(c.description, 90)}`);
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

  const chatExtras = plan.extraDependencies ?? [];
  if (chatExtras.length > 0) {
    lines.push("", `**Packages:** ${chatExtras.map((d) => `\`${d}\``).join(", ")}`);
  }

  lines.push(
    "",
    `**${files.length} files** in the build queue.`,
    "",
    "*Models read the full narrative from* `.appfactory/blueprint-brief.md` *; JSON in* `blueprint.json` *is for tools and validation.*",
  );

  return lines.join("\n");
};

/** @deprecated Alias — use formatPlanBriefForChat */
export const summarizePlanForChat = formatPlanBriefForChat;

/** @deprecated Alias — use formatPlanBriefForChat */
export const formatPlanBrief = formatPlanBriefForChat;

export const PLAN_DRAFTING_PLACEHOLDER =
  "**Drafting the blueprint…**\n\n" +
  "Mapping screens, navigation, theme, and product story. " +
  "You'll get a readable brief here; models will read `.appfactory/blueprint-brief.md`, " +
  "tools use `blueprint.json` for the exact file graph.";
