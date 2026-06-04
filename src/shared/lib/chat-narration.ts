// Bolt.new-style chat narration: long-form phase story + bridges between stages.
import type { ProjectStatus } from "@/shared/schemas/ws-messages";
import { describeFile, extractPlanDescriptions } from "@/shared/lib/generation-narration";

export interface PhaseNarrationContext {
  displayName?: string;
  projectName?: string;
  fileCount?: number;
}

const titledApp = (ctx: PhaseNarrationContext): string => {
  const name = ctx.displayName?.trim() || ctx.projectName?.trim();
  return name ? `**${name}**` : "your app";
};

type PhaseTransition = `${ProjectStatus}->${ProjectStatus}`;

/** What just finished — the "magic moment" between pipeline stages. */
export const formatPhaseBridge = (
  from: ProjectStatus,
  to: ProjectStatus,
  ctx: PhaseNarrationContext = {},
): string | null => {
  const key = `${from}->${to}` as PhaseTransition;
  const app = titledApp(ctx);

  const bridges: Partial<Record<PhaseTransition, string>> = {
    "planning->scaffolding": [
      "**✓ Blueprint frozen.**",
      "",
      "Navigation, theme, and every file slot are locked — the plan won't drift while we build.",
      "",
      `Next I'm materializing the real Expo project for ${app}: folders, router skeleton, Tamagui kit, and a warm dependency cache so codegen lands on solid ground.`,
    ].join("\n"),

    "scaffolding->generating": [
      "**✓ Workshop is open.**",
      "",
      "The shell exists on disk — Router groups, shared UI primitives, stores folder, types index. `node_modules` is linked from cache so we don't waste minutes reinstalling.",
      "",
      `Now the visible magic: I'll write ${app} file by file in dependency order. Watch the explorer — each checkmark is real TypeScript landing in your repo.`,
    ].join("\n"),

    "generating->analyzing": [
      "**✓ First draft on disk.**",
      "",
      "Every planned file has content. Before we touch the preview, I'm reading the graph — who imports whom, default vs named exports, hook return shapes.",
      "",
      "This pass catches the sneaky bugs that look fine in isolation but explode in Metro.",
    ].join("\n"),

    "analyzing->validating": [
      "**✓ Contracts align.**",
      "",
      "Cross-file references match how modules actually export. The wiring story is coherent.",
      "",
      "Now the strict gates — TypeScript, project rules, export smoke. We only earn a live preview when the build is honest.",
    ].join("\n"),

    "validating->building": [
      "**✓ Quality gates cleared.**",
      "",
      "The project compiles and passes our static checks. Code is ready to run, not just ready to read.",
      "",
      "Last act: wake Metro, kick the web bundle, and turn this into a clickable preview you can actually tap through.",
    ].join("\n"),

    "building->ready": [
      "**✓ Preview is alive.**",
      "",
      `${app} is running in the browser panel — routes, styles, and navigation you can click right now.`,
      "",
      "Iterate from here: ask for changes, polish the design, or ship. The loop is open.",
    ].join("\n"),
  };

  return bridges[key] ?? null;
};

const formatPhaseBody = (
  status: ProjectStatus,
  ctx: PhaseNarrationContext,
): string | null => {
  const app = titledApp(ctx);

  switch (status) {
    case "planning":
      return [
        "**🧭 Sketching the blueprint…**",
        "",
        `I'm mapping ${app} from your prompt: screens, flows, shared components, stores, and the exact file list so imports never fight each other.`,
        "",
        "You'll see the plan stream live in this thread — routes, descriptions, dependencies. When it feels complete, I lock it and nothing moves underneath us during codegen.",
        "",
        "*This is the creative phase — no disk writes yet, just architecture.*",
      ].join("\n");

    case "scaffolding":
      return [
        "**🏗 Laying the foundation…**",
        "",
        "Creating the Expo + Tamagui workspace: `app/` router tree, `src/components` kit, theme tokens, Zustand-ready stores folder, and TypeScript paths.",
        "",
        "I'm cloning from a warmed template and hard-linking `node_modules` so this step feels instant — the heavy install already happened once.",
        "",
        "*When this finishes, you'll see a project slug appear — that's your real repo folder waking up.*",
      ].join("\n");

    case "generating":
      return [
        "**✍️ Writing code, file by file…**",
        "",
        `Generating ${app} in dependency order — types & stores first, then components, then screens — so every import resolves the moment it's written.`,
        "",
        "Each file message below is the model thinking through that specific module: props, layout, navigation hooks, Tamagui styles.",
        "",
        "The file tree on the right is the scoreboard. The preview will stir as Metro discovers new routes.",
      ].join("\n");

    case "analyzing":
      return [
        "**🔍 Contract check…**",
        "",
        "Walking the import graph like a linter with taste: default vs named exports, barrel files, hook signatures, screen params.",
        "",
        "Fixing small mismatches now saves the dramatic red error screen later.",
        "",
        "*You won't see raw logs here — only the milestones that matter.*",
      ].join("\n");

    case "validating":
      return [
        "**🛡 Running quality gates…**",
        "",
        "TypeScript compile, project-specific rules, and a web export smoke test. We're proving the app builds, not just that it reads well.",
        "",
        "If something fails, self-healing kicks in before we promise you a preview.",
      ].join("\n");

    case "building":
      return [
        "**🚀 Starting Metro & live preview…**",
        "",
        "First web bundle can take a minute — Tamagui + Expo web is chunky. I'm nudging the dev server and watching stdout for the ready signal.",
        "",
        "Hang tight: soon you'll get a real URL in the preview panel, not a placeholder.",
        "",
        "*This is the moment code becomes something you can click.*",
      ].join("\n");

    default:
      return null;
  }
};

/** Rich phase update: optional bridge from previous stage + body for the new stage. */
export const formatPhaseChatNarration = (
  status: ProjectStatus,
  ctx: PhaseNarrationContext = {},
  previousStatus?: ProjectStatus | null,
): string | null => {
  const body = formatPhaseBody(status, ctx);
  if (!body) return null;

  if (!previousStatus || previousStatus === status) {
    return body;
  }

  const bridge = formatPhaseBridge(previousStatus, status, ctx);
  if (!bridge) {
    return body;
  }

  return [bridge, "", "---", "", body].join("\n");
};

export const formatPlanLockedNarration = (
  displayName: string,
  fileCount: number,
): string =>
  [
    "**📌 Plan locked — we're building for real now.**",
    "",
    `**${displayName}** has a frozen blueprint: **${fileCount} files** mapped with paths, types, and dependencies.`,
    "",
    "The streaming plan above is the source of truth. Next I'll scaffold the Expo shell, then write each file against this map — no improvisation on structure.",
    "",
    "*You'll see foundation → codegen → checks → preview in order. Grab coffee; the fun part starts in seconds.*",
  ].join("\n");

export const formatScaffoldReadyNarration = (projectName: string): string =>
  [
    "**📂 Scaffold is live on disk.**",
    "",
    `Project \`${projectName}\` exists: Expo Router, Tamagui theme, shared UI kit, stores skeleton, and cached dependencies.`,
    "",
    "The explorer can show real folders now. Codegen is about to fill them — one file at a time, with reasoning bubbles when the model explains its choices.",
    "",
    "*Watch the status shift to «Writing your code» — that's the orchestra tuning up.*",
  ].join("\n");

export const formatFileWritingNarration = (
  filepath: string,
  progress: number,
  plan: Record<string, unknown> | null,
): string => {
  const pct = Math.round(progress * 100);
  const descriptions = extractPlanDescriptions(plan);
  const intent = describeFile(filepath, descriptions);
  const shortPath = filepath.split("/").pop() ?? filepath;

  if (progress < 0.12) {
    return [
      `**✏️ Opening \`${shortPath}\`…**`,
      "",
      intent,
      "",
      `Pulling sibling files and the plan so imports, types, and Tamagui styles stay consistent.`,
      "",
      `\`${shortPath}\` · ${pct}%`,
    ].join("\n");
  }

  return [`**\`${shortPath}\`** · ${pct}%`, intent].join("\n");
};

export const formatGenerationDoneNarration = (filesCount: number): string =>
  [
    "**🎉 Codegen pass complete.**",
    "",
    `**${filesCount} files** now live in the project — screens, components, stores, the works.`,
    "",
    "The raw writing pass is done. Next I'll analyze imports, run quality gates, and boot Metro so you get a clickable preview — still part of the same magic trick, just act two.",
  ].join("\n");

export const formatPreviewReadyNarration = (port: number, displayName?: string): string => {
  const app = displayName?.trim() ? `**${displayName.trim()}**` : "Your app";
  return [
    "**🌐 Live preview is ready.**",
    "",
    `${app} is serving on port **${port}** — open the preview panel and click through real routes.`,
    "",
    "What you see is the actual bundle, not a mock. Ask for changes anytime; I'll diff files and keep the loop going.",
  ].join("\n");
};
