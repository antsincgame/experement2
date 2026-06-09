// Generates files with contract-aware layouts, broader dependency context, and safer import normalization.
import { Project, QuoteKind, ScriptKind } from "ts-morph";
import { streamCompletion, type CompleteFn } from "../services/llm-proxy.js";
import { writeFile, readFile } from "../services/file-manager.js";
import path from "path";
import { buildProjectSkeleton, extractExportContracts, type ExportContract } from "./context-builder.js";
import type { AppPlan } from "../schemas/app-plan.schema.js";
import { formatPlanBriefForModels } from "./plan-brief.js";
import type { ContractViolation } from "./project-validator.js";
import { formatDiagnosticsForPrompt, type TypeDiagnostic } from "./typecheck.js";
import { SYSTEM_GENERATOR } from "../prompts/system-generator.js";
import { getGenerationContext } from "./rag-retrieve.js";
import { findSimilarFixes, buildPastFixBlock } from "./error-fix-store.js";
import { buildGoldenExampleBlock } from "./golden-examples.js";
import { composeTeachingContext } from "./teaching-context.js";
import { applyDeterministicCodeRepairs } from "./code-style-repairs.js";
import { broadcast } from "./event-bus.js";
import { warnCaught } from "./catch-log.js";
import {
  BOILERPLATE_TEMPLATES,
  buildTamaguiConfig,
  getIndexRedirect,
  getRootLayout,
  getTabsLayout,
} from "../prompts/templates.js";
import {
  AUTO_GENERATED_PLAN_FILES,
  ICON_CONTRACT,
  MAX_DEPENDENCY_CONTEXT_CHARS,
  MAX_DEPENDENCY_CONTEXT_FILES,
  normalizeAliasSpecifier,
  VECTOR_ICON_IMPORT_PATHS,
} from "./generation-contract.js";
import { validateAppPlan, validateFileContracts } from "./project-validator.js";
import { generateBestCandidate } from "./best-of-n.js";
import { scoreCandidateFile } from "./quality-score.js";
import { isPlanFileComplete, isStructurallyComplete } from "./generation-state.js";
import { collectStream } from "./stream-collect.js";

interface GeneratorOptions {
  projectName: string;
  projectPath: string;
  plan: AppPlan;
  lmStudioUrl?: string;
  model?: string;
  /** Override embedding model; when unset, agent auto-picks from LM Studio. */
  embeddingModel?: string;
  /** Smart context (semantic RAG). Default true; falls back to keyword RAG if no embedder. */
  semanticRagEnabled?: boolean;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  /** Model-completion seam; defaults to the real streamCompletion. */
  complete?: CompleteFn;
  onFileStart?: (filepath: string, index: number, total: number) => void;
  onChunk?: (chunk: string) => void;
  /** Per-file model reasoning (captured from <think>/<thinking> blocks) for chat humanization. */
  onThinking?: (filepath: string, reasoning: string) => void;
  onFileComplete?: (filepath: string) => void;
  /** When true, skip LLM for files that already exist with a valid // EOF marker. */
  skipExistingFiles?: boolean;
  /** Test-time compute: draw N candidates per file and keep the verifier-best. 1 = today. */
  bestOfN?: number;
}

/**
 * Compact plan context for a single file generation. Instead of embedding the
 * full plan JSON (O(files × plan_size), now even larger with rich descriptions),
 * send the app header, a cheap file manifest (the "map"), and only the intent of
 * THIS file's direct dependencies. Their full code is still appended separately.
 */
export const buildPlanContext = (
  plan: AppPlan,
  fileSpec: AppPlan["files"][number]
): string => {
  const depSpecs = fileSpec.dependencies
    .map((dep) => plan.files.find((f) => f.path === dep))
    .filter((f): f is AppPlan["files"][number] => Boolean(f))
    .map((f) => `- ${f.path} (${f.type}): ${f.description}`);

  const sections = [
    "## Product blueprint (primary — read before coding)",
    formatPlanBriefForModels(plan),
    "",
    "## Your assignment",
    `Path: ${fileSpec.path}`,
    `Type: ${fileSpec.type}`,
    `Spec: ${fileSpec.description}`,
  ];
  if (depSpecs.length > 0) {
    sections.push("", "## Direct dependencies (must match imports)", depSpecs.join("\n"));
  }
  return sections.join("\n");
};

/** Extracts the first reasoning block (<think>/<thinking>/redacted_thinking) for display. */
export const extractReasoning = (text: string): string => {
  const match = text.match(
    /<(think|thinking|redacted_thinking)>([\s\S]*?)<\/\1>/i
  );
  if (match) {
    return match[2].trim();
  }
  // Unclosed block: take everything after the opening tag.
  const open = text.match(/<(?:think|thinking|redacted_thinking)>([\s\S]*)/i);
  return open ? open[1].trim() : "";
};

export const normalizeImportDeclarations = (code: string): string => {
  try {
    const project = new Project({
      useInMemoryFileSystem: true,
      manipulationSettings: { quoteKind: QuoteKind.Double },
      skipLoadingLibFiles: true,
    });
    const sourceFile = project.createSourceFile("generated.tsx", code, {
      overwrite: true,
      scriptKind: ScriptKind.TSX,
    });

    for (const declaration of sourceFile.getImportDeclarations()) {
      const normalizedSpecifier = normalizeAliasSpecifier(
        declaration.getModuleSpecifierValue()
      );

      if (normalizedSpecifier !== declaration.getModuleSpecifierValue()) {
        declaration.setModuleSpecifier(normalizedSpecifier);
      }

      if (normalizedSpecifier === "expo-router/tabs") {
        declaration.setModuleSpecifier("expo-router");
      }

      if (normalizedSpecifier !== ICON_CONTRACT.packageName) {
        continue;
      }

      const namedImports = declaration.getNamedImports().map((item) => item.getName());
      const supportedIconName = namedImports.find(
        (iconName) => VECTOR_ICON_IMPORT_PATHS[iconName]
      );

      declaration.removeNamedImports();
      declaration.setDefaultImport(
        supportedIconName ?? ICON_CONTRACT.defaultImportName
      );
      declaration.setModuleSpecifier(
        supportedIconName
          ? VECTOR_ICON_IMPORT_PATHS[supportedIconName]
          : ICON_CONTRACT.defaultImportPath
      );
    }

    return sourceFile.getFullText();
  } catch (error) {
    warnCaught("generator", error, "normalize vector icon imports");
    return code;
  }
};

/**
 * Post-process: only SAFE, output-parsing cleanups (strip thinking blocks, code
 * fences, normalize a couple of import specifiers, enforce the export-style
 * contract). Framework-translation and icon-name rewriting were removed: icons
 * are now type-safe via the scaffolded <Icon> wrapper, and real type mismatches
 * are repaired by the compiler-in-the-loop (see typecheck.ts + pipeline Step 3c).
 */
export const sanitizeGeneratedCode = (code: string, filePath = ""): string => {
  let result = code;

  // Strip reasoning blocks from thinking-enabled models (Qwen3 <think>,
  // DeepSeek-R1, our <thinking>, and redacted_thinking variants).
  result = result.replace(/<(think|thinking|redacted_thinking)>[\s\S]*?<\/\1>/gi, "").trim();
  if (/<(?:think|thinking|redacted_thinking)>/i.test(result)) {
    result = result.replace(/<(?:think|thinking|redacted_thinking)>[\s\S]*/gi, "").trim();
  }

  result = result.replace(/from\s+["']@\/src\//g, 'from "@/');
  result = result.replace(/from\s*["']expo-router\/tabs["']/g, 'from "expo-router"');

  result = fixHookImports(result);
  result = fixComponentImports(result);
  result = ensureDefaultExport(result, filePath);
  result = normalizeImportDeclarations(result);

  result = applyDeterministicCodeRepairs(result);

  // Fix: React.useState/useEffect/useCallback → direct import (if React not imported)
  if (result.includes("React.use") && !result.includes("import React")) {
    const reactHooks = new Set<string>();
    const hookMatches = result.matchAll(/React\.(use\w+)/g);
    for (const m of hookMatches) reactHooks.add(m[1]);
    if (reactHooks.size > 0) {
      const hooksList = [...reactHooks].join(", ");
      result = `import { ${hooksList} } from "react";\n` + result;
      for (const hook of reactHooks) {
        result = result.replace(new RegExp(`React\\.${hook}`, "g"), hook);
      }
    }
  }

  return result;
};

/** Ensure hooks and components use export default (not named export) */
export const ensureDefaultExport = (code: string, filePath: string): string => {
  // Only apply to hooks and components
  const isHook = filePath.includes("/hooks/") && filePath.match(/use[A-Z]/);
  const isComponent = filePath.includes("/components/") && filePath.match(/\/[A-Z]/);
  const isScreen = filePath.startsWith("app/");

  if (!isHook && !isComponent && !isScreen) return code;

  // If already has export default → OK
  if (/export\s+default\s+/.test(code)) return code;

  // Fix: export function useX() → export default function useX()
  // Fix: export function ComponentName() → export default function ComponentName()
  return code.replace(
    /^(export)\s+(function\s+(?:use[A-Z]|[A-Z])\w*)/m,
    "$1 default $2"
  );
};

/** Fix named imports of hooks — hooks use export default, must be imported without braces */
export const fixHookImports = (code: string): string => {
  // Match: import { useX } from "@/hooks/useX" → import useX from "@/hooks/useX"
  return code.replace(
    /import\s*\{\s*(use[A-Z]\w*)\s*\}\s*from\s*(["']@\/hooks\/[^"']+["'])/g,
    "import $1 from $2"
  );
};

/** Fix named imports of components — components use export default */
export const fixComponentImports = (code: string): string => {
  // Match: import { ComponentName } from "@/components/ComponentName" → import ComponentName from ...
  return code.replace(
    /import\s*\{\s*([A-Z]\w*)\s*\}\s*from\s*(["']@\/components\/[^"']+["'])/g,
    "import $1 from $2"
  );
};

const buildDependencyContext = (
  projectName: string,
  dependencies: string[]
): string[] => {
  const dependencyContents: string[] = [];
  let currentSize = 0;

  for (const dependencyPath of dependencies) {
    if (dependencyContents.length >= MAX_DEPENDENCY_CONTEXT_FILES) {
      break;
    }

    const content = readFile(projectName, dependencyPath);
    if (!content) {
      continue;
    }

    const block = `// --- ${dependencyPath} ---\n${content}`;
    if (
      dependencyContents.length > 0 &&
      currentSize + block.length > MAX_DEPENDENCY_CONTEXT_CHARS
    ) {
      break;
    }

    dependencyContents.push(block);
    currentSize += block.length;
  }

  return dependencyContents;
};

export const extractCodeFromResponse = (response: string): { filepath: string; code: string } | null => {
  const filepathMatch = response.match(/^filepath:\s*(.+)/m);
  if (!filepathMatch) return null;

  const filepath = filepathMatch[1].trim();
  let code = response.slice(response.indexOf("\n", response.indexOf(filepathMatch[0])) + 1);

  // Aggressively strip ALL markdown code fences (LLM sometimes wraps in triple backticks)
  code = code
    .replace(/^```\w*\s*\n?/, "")    // opening fence with any language tag
    .replace(/\n?```\s*$/, "")        // closing fence
    .replace(/^```\s*\n?/, "")        // bare opening fence (no language)
    .trim();
  // Double-check: if first line is still a code fence, remove it
  if (code.startsWith("```")) {
    code = code.replace(/^```\w*\s*\n?/, "").trim();
  }

  // Post-process: fix common LLM mistakes that cause crashes
  code = sanitizeGeneratedCode(code, filepath);

  return { filepath, code };
};

/** Marker written when a file's first generation returned empty; triggers full regen. */
const EMPTY_FILE_PLACEHOLDER = "// EMPTY — awaiting retry";

/** Do not replace a substantial on-disk file with an EMPTY stub when LLM fails. */
const shouldPreserveExistingOnFailure = (existing: string | null | undefined): boolean => {
  if (!existing?.trim()) return false;
  if (existing.includes(EMPTY_FILE_PLACEHOLDER)) return false;
  return existing.length > 80;
};

interface EmptyRegenContext {
  projectName: string;
  projectPath: string;
  fileSpec: AppPlan["files"][number];
  plan: AppPlan;
}

interface EmptyRegenOptions {
  complete?: CompleteFn;
  lmStudioUrl?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

/**
 * Regenerate a file FROM SCRATCH after its first attempt came back empty. Unlike the
 * truncation path, this sends the full plan/file intent + dependency contracts so the
 * model rebuilds the whole file rather than "continuing" from a placeholder comment.
 */
const regenerateEmptyFile = async (
  ctx: EmptyRegenContext,
  options: EmptyRegenOptions,
): Promise<string | null> => {
  const complete = options.complete ?? streamCompletion;

  const depContracts: Record<string, ExportContract[]> = {};
  for (const depPath of ctx.fileSpec.dependencies) {
    const contracts = extractExportContracts(path.join(ctx.projectPath, depPath));
    if (contracts && contracts.length > 0) depContracts[depPath] = contracts;
  }
  const contractsBlock = Object.keys(depContracts).length > 0
    ? `\n## Dependency Export Contracts (JSON)\n\`\`\`json\n${JSON.stringify(depContracts, null, 2)}\n\`\`\`\n`
    : "";

  const messages = [
    { role: "system" as const, content: SYSTEM_GENERATOR },
    {
      role: "user" as const,
      content: `/no_think\n${buildPlanContext(ctx.plan, ctx.fileSpec)}\n\n## Target File\nPath: ${ctx.fileSpec.path}\nType: ${ctx.fileSpec.type}\nDescription: ${ctx.fileSpec.description}\n${contractsBlock}\nThe previous attempt produced an EMPTY file. Generate the COMPLETE code for ${ctx.fileSpec.path} now. Output ONLY raw code — NO markdown fences, NO explanations. End the file with // EOF.`,
    },
  ];

  let raw: string;
  try {
    const stream = await complete(messages, {
      temperature: options.temperature ?? 0.4,
      maxTokens: options.maxTokens ?? 65536,
      lmStudioUrl: options.lmStudioUrl,
      model: options.model,
    });
    raw = await collectStream(stream);
  } catch (err) {
    // Idle-stall/network abort during a heal must not kill the whole generation —
    // leave the placeholder and let the build/gates report honestly.
    console.warn(
      `[Generator] Empty-file heal failed for ${ctx.fileSpec.path} (${err instanceof Error ? err.message : String(err)})`,
    );
    return null;
  }
  const extracted = extractCodeFromResponse(raw);
  if (extracted) return extracted.code;
  return raw
    .replace(/^```(?:tsx?|typescript|jsx?)?\s*\n?/, "")
    .replace(/\n?```\s*$/, "")
    .trim();
};

export const generateFiles = async (options: GeneratorOptions): Promise<string[]> => {
  const {
    projectName,
    projectPath,
    plan,
    lmStudioUrl,
    model,
    embeddingModel,
    semanticRagEnabled = true,
    temperature,
    maxTokens,
    topP,
    complete = streamCompletion,
    onFileStart,
    onChunk,
    onThinking,
    onFileComplete,
    skipExistingFiles = false,
    bestOfN = 1,
  } = options;

  const planIssues = validateAppPlan(plan);
  if (planIssues.length > 0) {
    throw new Error(
      `Plan is not internally consistent: ${planIssues
        .map((issue) => `${issue.filePath ?? "plan"}: ${issue.message}`)
        .join("; ")}`
    );
  }

  const generatedFiles: string[] = [];

  // Write static boilerplate (config files)
  for (const [templatePath, templateContent] of Object.entries(BOILERPLATE_TEMPLATES)) {
    const alreadyInPlan = plan.files.some((f) => f.path === templatePath);
    if (!alreadyInPlan) {
      writeFile(projectName, templatePath, templateContent);
      generatedFiles.push(templatePath);
    }
  }

  // Write dynamic layouts from the validated navigation contract.
  const navType = plan.navigation?.type ?? "stack";
  writeFile(projectName, "app/_layout.tsx", getRootLayout(plan.navigation));
  generatedFiles.push("app/_layout.tsx");

  if (navType === "tabs") {
    writeFile(projectName, "app/(tabs)/_layout.tsx", getTabsLayout(plan.navigation));
    generatedFiles.push("app/(tabs)/_layout.tsx");
  }

  // Guarantee a "/" route. Expo web 404s the index when no root route exists
  // (e.g. a plan with only /login, /transport, /tracking), which the preview
  // health check reads as a dead Metro and which leaves the iframe blank. If the
  // plan ships no index route, redirect "/" to the first screen deterministically.
  const planHasIndexRoute = plan.files.some(
    (file) => file.path === "app/index.tsx" || file.path === "app/(tabs)/index.tsx"
  );
  if (!planHasIndexRoute) {
    writeFile(projectName, "app/index.tsx", getIndexRedirect(plan.navigation));
    generatedFiles.push("app/index.tsx");
  }

  // Sort files: types → stores → hooks → components → screens
  // This ensures dependencies are generated BEFORE consumers,
  // so extractExportContracts can provide accurate contracts.
  const FILE_TYPE_ORDER: Record<string, number> = {
    type: 0,
    store: 1,
    hook: 2,
    component: 3,
    screen: 4,
    layout: 5,
  };
  const sortedFiles = [...plan.files].sort((a, b) => {
    const orderA = FILE_TYPE_ORDER[a.type] ?? 3;
    const orderB = FILE_TYPE_ORDER[b.type] ?? 3;
    return orderA - orderB;
  });

  const totalFiles = sortedFiles.length;

  // Auto-generated layout files — skip if LLM plan includes them
  const AUTO_LAYOUT_FILES = new Set<string>(AUTO_GENERATED_PLAN_FILES);

  for (let i = 0; i < totalFiles; i++) {
    const fileSpec = sortedFiles[i];

    // Skip auto-generated layouts — already written above
    if (AUTO_LAYOUT_FILES.has(fileSpec.path)) {
      onFileStart?.(fileSpec.path, i, totalFiles);
      onFileComplete?.(fileSpec.path);
      continue;
    }

    onFileStart?.(fileSpec.path, i, totalFiles);

    if (skipExistingFiles) {
      const existing = readFile(projectName, fileSpec.path);
      if (isPlanFileComplete(existing)) {
        if (!generatedFiles.includes(fileSpec.path)) {
          generatedFiles.push(fileSpec.path);
        }
        onFileComplete?.(fileSpec.path);
        continue;
      }
    }

    try {
    const skeleton = buildProjectSkeleton(projectPath);

    const depContents = buildDependencyContext(projectName, fileSpec.dependencies);

    // Extract JSON export contracts from already-generated dependencies
    const depContracts: Record<string, ExportContract[]> = {};
    for (const depPath of fileSpec.dependencies) {
      const fullPath = path.join(projectPath, depPath);
      const contracts = extractExportContracts(fullPath);
      if (contracts && contracts.length > 0) {
        depContracts[depPath] = contracts;
      }
    }

    const hasContracts = Object.keys(depContracts).length > 0;
    const ragContext = await getGenerationContext(
      {
        path: fileSpec.path,
        type: fileSpec.type,
        description: fileSpec.description,
        dependencies: fileSpec.dependencies,
      },
      {
        semanticRagEnabled,
        embedOptions: { url: lmStudioUrl, model: embeddingModel },
      }
    );
    const goldenExampleBlock = buildGoldenExampleBlock({
      type: fileSpec.type,
      description: fileSpec.description,
    });
    const teachingContext = composeTeachingContext(ragContext.text, goldenExampleBlock);
    broadcast({
      type: "build_event",
      eventType: "rag_injected",
      message: `🧠 ${ragContext.semantic ? "Semantic" : "Keyword"} RAG + teaching context for ${fileSpec.path}`,
    });

    const userMessage = `
${buildPlanContext(plan, fileSpec)}

## Project Skeleton
${skeleton.summary}

${teachingContext}

## Target File
Path: ${fileSpec.path}
Type: ${fileSpec.type}
Description: ${fileSpec.description}
${hasContracts ? `
## Dependency Export Contracts (JSON)
\`\`\`json
${JSON.stringify(depContracts, null, 2)}
\`\`\`

### CRITICAL IMPORT & DESTRUCTURING RULES:
1. isDefaultExport: true → MUST use: \`import X from "path"\` (NO braces)
2. isDefaultExport: false → MUST use: \`import { X } from "path"\` (WITH braces)
3. returnObjectKeys → destructure ONLY these exact keys, no others
4. propsInterface → your component props must match this shape
` : ""}
## Dependencies (full code)
${depContents.length > 0 ? depContents.join("\n\n") : "None yet"}

Generate the complete code for: ${fileSpec.path}`;

    const messages = [
      { role: "system" as const, content: SYSTEM_GENERATOR },
      { role: "user" as const, content: `/no_think\n${userMessage}` },
    ];

    let responseBuffer = "";

    if (bestOfN > 1) {
      // ── Test-time compute (Phase 2): best-of-N + verifier reranking ──
      // Draw N candidates and keep the one the deterministic verifier likes best
      // (fewest contract violations against this file's dependencies + content quality).
      // No streaming/reasoning here (candidates are drained fully); we replay the winner
      // through onChunk so the UI still shows the chosen file.
      broadcast({
        type: "build_event",
        eventType: "self_healing",
        message: `🎲 Best-of-${bestOfN}: sampling ${fileSpec.path}`,
      });
      const { winnerText, scores } = await generateBestCandidate({
        n: bestOfN,
        messages,
        options: { temperature: temperature ?? 0.4, maxTokens: maxTokens ?? 65536, topP, lmStudioUrl, model },
        complete,
        extract: (text) => extractCodeFromResponse(text)?.code ?? null,
        scoreCandidate: (code) => {
          let violations = 0;
          try {
            violations = validateFileContracts(code, fileSpec.path, depContracts, projectPath).length;
          } catch {
            /* scoring is best-effort */
          }
          return scoreCandidateFile(fileSpec.path, code) - 25 * violations;
        },
      });
      responseBuffer = winnerText;
      onChunk?.(winnerText); // UI parity: show the chosen candidate
      broadcast({
        type: "build_event",
        eventType: "self_healing",
        message: `🎲 Best-of-${bestOfN} picked best of [${scores.map((s) => Math.round(s)).join(", ")}] for ${fileSpec.path}`,
      });
    } else {
      let lastReasoningLen = 0;
      let reasoningClosed = false;

      const generator = await complete(messages, {
        temperature: temperature ?? 0.4,
        maxTokens: maxTokens ?? 65536,
        topP,
        lmStudioUrl,
        model,
      });

      // Buffer chunks — send to frontend max every 100ms to prevent React re-render storm
      let chunkBuffer = "";
      let lastSendTime = Date.now();

      for await (const chunk of generator) {
        responseBuffer += chunk;
        chunkBuffer += chunk;
        if (onThinking && !reasoningClosed) {
          const reasoning = extractReasoning(responseBuffer);
          if (reasoning.length > lastReasoningLen) {
            onThinking(fileSpec.path, reasoning);
            lastReasoningLen = reasoning.length;
          }
          // Once the think block is closed the reasoning is final — stop re-scanning the
          // growing buffer (which now contains all the file code) on every chunk (was O(n²)).
          if (/<\/(?:think|thinking|redacted_thinking)>/i.test(responseBuffer)) {
            reasoningClosed = true;
          }
        }
        if (Date.now() - lastSendTime > 100) {
          onChunk?.(chunkBuffer);
          chunkBuffer = "";
          lastSendTime = Date.now();
        }
      }
      if (chunkBuffer) onChunk?.(chunkBuffer); // flush remainder
    }

    const extracted = extractCodeFromResponse(responseBuffer);
    if (extracted) {
      if (extracted.filepath !== fileSpec.path) {
        console.warn(
          `[Generator] Model filepath "${extracted.filepath}" != plan "${fileSpec.path}" — writing to plan path`,
        );
      }
      writeFile(projectName, fileSpec.path, extracted.code);
      if (!generatedFiles.includes(fileSpec.path)) {
        generatedFiles.push(fileSpec.path);
      }
    } else {
      let code = responseBuffer
        .replace(/^```(?:typescript|tsx|ts|jsx|js)?\n?/, "")
        .replace(/\n?```\s*$/, "")
        .trim();

      // ALWAYS run sanitizer (bug fix: fallback was missing sanitization)
      code = sanitizeGeneratedCode(code, fileSpec.path);

      if (code.length > 10) {
        writeFile(projectName, fileSpec.path, code);
        if (!generatedFiles.includes(fileSpec.path)) {
          generatedFiles.push(fileSpec.path);
        }
      } else {
        const existing = readFile(projectName, fileSpec.path);
        if (shouldPreserveExistingOnFailure(existing)) {
          console.warn(
            `[Generator] Empty/tiny LLM output for ${fileSpec.path} — keeping existing ${existing!.length} chars`,
          );
        } else {
          console.warn(`[Generator] Empty/tiny code for ${fileSpec.path} (${code.length} chars) — will fully regenerate`);
          writeFile(projectName, fileSpec.path, `${EMPTY_FILE_PLACEHOLDER}\n`);
        }
        if (!generatedFiles.includes(fileSpec.path)) {
          generatedFiles.push(fileSpec.path);
        }
      }
    }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[Generator] Failed ${fileSpec.path}:`, message);
      broadcast({
        type: "build_event",
        eventType: "self_healing",
        message: `⚠️ ${fileSpec.path}: ${message.slice(0, 220)} — will retry in heal pass`,
      });
      const existing = readFile(projectName, fileSpec.path);
      if (!shouldPreserveExistingOnFailure(existing) && !existing?.includes(EMPTY_FILE_PLACEHOLDER)) {
        writeFile(projectName, fileSpec.path, `${EMPTY_FILE_PLACEHOLDER}\n`);
      }
      if (!generatedFiles.includes(fileSpec.path)) {
        generatedFiles.push(fileSpec.path);
      }
    } finally {
      // Always unblock the UI even when the model returns empty output, wrong filepath, or times out.
      onFileComplete?.(fileSpec.path);
    }
  }

  // Smart self-healing for incomplete files. Two distinct failure modes need two
  // different prompts: an EMPTY placeholder must be generated FROM SCRATCH (a
  // "continue where you left off" prompt would have the model continue from the
  // literal placeholder comment — garbage), while a genuinely truncated file is
  // continued from its tail. Mixing them is the subtle bug this split fixes.
  const MAX_TRUNCATION_RETRIES = 3;
  let truncationRetries = 0;

  while (truncationRetries < MAX_TRUNCATION_RETRIES) {
    const empty: string[] = [];
    const truncated: string[] = [];
    for (const fp of generatedFiles) {
      if (AUTO_LAYOUT_FILES.has(fp)) continue;
      if (fp === "tamagui.config.ts") continue;
      const content = readFile(projectName, fp);
      if (!content) continue;
      if (content.includes(EMPTY_FILE_PLACEHOLDER)) {
        empty.push(fp);
      } else if (
        !content.includes("// EOF") &&
        !isStructurallyComplete(content) &&
        content.length > 20
      ) {
        // Only "continue" a file that is BOTH missing its // EOF marker AND
        // structurally incomplete (unbalanced braces = genuinely cut off). A complete
        // file that merely dropped the marker is left alone instead of having garbage
        // appended onto already-working code.
        truncated.push(fp);
      }
    }

    if (empty.length === 0 && truncated.length === 0) break;
    truncationRetries++;

    for (const fp of empty) {
      broadcast({ type: "build_event", eventType: "self_healing", message: `🔄 Auto-Healing: Regenerating empty file ${fp}` });
      const fileSpec = plan.files.find((f) => f.path === fp);
      if (!fileSpec) continue;

      const regenerated = await regenerateEmptyFile(
        { projectName, projectPath, fileSpec, plan },
        { complete, lmStudioUrl, model, temperature, maxTokens },
      );
      if (regenerated && regenerated.length > 10) {
        writeFile(projectName, fp, sanitizeGeneratedCode(regenerated, fp));
      }
    }

    for (const fp of truncated) {
      broadcast({ type: "build_event", eventType: "self_healing", message: `🔄 Auto-Healing: Continuing truncated file ${fp}` });
      const fileSpec = plan.files.find((f) => f.path === fp);
      if (!fileSpec) continue;

      let currentContent = readFile(projectName, fp) ?? "";
      // Strip trailing markdown fences that LLM may have added at cutoff
      currentContent = currentContent.replace(/\n?```[a-z]*\s*$/, "");

      const retryMessages = [
        { role: "system" as const, content: SYSTEM_GENERATOR },
        {
          role: "user" as const,
          content: `/no_think\nYou were generating the file ${fp} but the output was truncated due to length limits.\nHere are the last 200 characters you wrote:\n...${currentContent.slice(-200)}\n\nPlease CONTINUE generating the file EXACTLY from where you left off.\nDO NOT repeat the code that is already written.\nDO NOT wrap your response in markdown code fences.\nJust output the exact next characters to complete the file.\nEnd the file with // EOF.`,
        },
      ];

      try {
        const retryGen = await complete(retryMessages, {
          temperature: temperature ?? 0.3,
          maxTokens: maxTokens ?? 65536,
          lmStudioUrl,
          model,
        });

        let retryCode = await collectStream(retryGen);

        // Strip markdown fences from continuation
        retryCode = retryCode
          .replace(/^```(?:tsx?|typescript)?\s*\n?/, "")
          .replace(/\n?```\s*$/, "")
          .trim();

        if (retryCode.length > 5) {
          currentContent += "\n" + retryCode;
          writeFile(projectName, fp, sanitizeGeneratedCode(currentContent, fp));
        }
      } catch (err) {
        // Idle-stall/network abort during a continuation must not abort the whole
        // generation — keep whatever partial content exists for this file.
        console.warn(
          `[Generator] Truncation continuation failed for ${fp} (${err instanceof Error ? err.message : String(err)}); keeping partial`,
        );
      }
    }
  }

  // Final check: if zero real files were generated, something is critically wrong
  const realFiles = generatedFiles.filter((fp) => !AUTO_LAYOUT_FILES.has(fp));
  if (realFiles.length === 0) {
    throw new Error("No application files were generated — LLM returned empty responses for all files");
  }

  return generatedFiles;
};

// ── Contract Auto-Fix: regenerate a single file with violation context ──

export const regenerateFileWithContracts = async (
  projectName: string,
  _projectPath: string,
  filePath: string,
  violations: ContractViolation[],
  contracts: Record<string, ExportContract[]>,
  options: { lmStudioUrl?: string; model?: string; maxTokens?: number; complete?: CompleteFn } = {},
): Promise<string | null> => {
  const currentContent = readFile(projectName, filePath) ?? "";
  const violationsText = violations.map((v) => `- [${v.code}] ${v.message}`).join("\n");

  const messages = [
    {
      role: "system" as const,
      content: `You are fixing a React Native TypeScript file.
Output ONLY raw TypeScript code. NO greetings. NO markdown. NO explanations.
The very first line of your response MUST be an import statement or export statement.
If you add ANY text before the code, the build will fail.

CONTRACTS:
${JSON.stringify(contracts, null, 2)}

RULES:
- isDefaultExport: true → import X from "path" (NO braces)
- isDefaultExport: false → import { X } from "path" (WITH braces)
- returnObjectKeys → destructure ONLY these exact keys`,
    },
    {
      role: "user" as const,
      content: `Fix ${filePath}. Violations:\n${violationsText}\n\nCurrent code:\n${currentContent}`,
    },
  ];

  let fixedCode: string;
  try {
    const generator = await (options.complete ?? streamCompletion)(messages, {
      temperature: 0.2,
      maxTokens: options.maxTokens ?? 65536,
      lmStudioUrl: options.lmStudioUrl,
      model: options.model,
    });
    fixedCode = await collectStream(generator);
  } catch (err) {
    // A network error or an idle-stall abort (LLM_STREAM_IDLE) must NOT abort the
    // whole generation here — contract-fix is best-effort. Return null so the caller
    // proceeds with the original file (matches the short-output path below).
    console.warn(
      `[Generator] Contract regen failed for ${filePath} (${err instanceof Error ? err.message : String(err)}); keeping original`,
    );
    return null;
  }

  fixedCode = stripCodePreamble(fixedCode);

  if (fixedCode.length < 10) return null;

  writeFile(projectName, filePath, sanitizeGeneratedCode(fixedCode, filePath));
  return fixedCode;
};

// ── Compiler-in-the-loop: regenerate a single file given its TYPE errors ──

export const stripCodePreamble = (raw: string): string => {
  let code = raw.trim()
    .replace(/^```(?:tsx?|typescript)?\s*\n?/, "")
    .replace(/\n?```\s*$/, "")
    .trim();
  // Drop any non-code preamble like "Here is the fix:".
  const firstImport = code.indexOf("import ");
  const firstExport = code.indexOf("export ");
  const codeStart = Math.min(
    firstImport >= 0 ? firstImport : Infinity,
    firstExport >= 0 ? firstExport : Infinity
  );
  if (codeStart > 0 && codeStart < Infinity) {
    code = code.slice(codeStart);
  }
  return code;
};

export const regenerateFileWithTypeErrors = async (
  projectName: string,
  projectPath: string,
  filePath: string,
  diagnostics: TypeDiagnostic[],
  contracts: Record<string, ExportContract[]>,
  options: { lmStudioUrl?: string; model?: string; maxTokens?: number; complete?: CompleteFn } = {}
): Promise<boolean> => {
  const currentContent = readFile(projectName, filePath);
  if (!currentContent) return false;

  const skeleton = buildProjectSkeleton(projectPath);
  const errorBlock = formatDiagnosticsForPrompt(diagnostics);
  const hasContracts = Object.keys(contracts).length > 0;

  // Pull a concrete exemplar from past successful fixes for a similar type error.
  // Advisory only: no match → empty string → prompt is byte-identical to before.
  const pastFix = buildPastFixBlock(findSimilarFixes(errorBlock, { file: filePath }));
  const pastFixBlock = pastFix ? `\n${pastFix}\n` : "";

  const messages = [
    {
      role: "system" as const,
      content: `You fix TypeScript type errors in ONE React Native (Expo + Tamagui) file.
Output ONLY the complete corrected file as raw TypeScript. NO markdown fences. NO explanations. NO preamble.
The very first line MUST be an import or export statement.
Change ONLY what is needed to clear the type errors; preserve all existing behavior and structure.
UI primitives and icons come from "@/ui" (e.g. import { Box, Row, Text, Button, Input, Icon } from "@/ui"); <Icon name="..."> accepts ANY string.
Import every custom type you use: import type { X } from "@/types/index".`,
    },
    {
      role: "user" as const,
      content: `File: ${filePath}
${pastFixBlock}
## Project Skeleton
${skeleton.summary}
${hasContracts ? `\n## Dependency Export Contracts (JSON)\n\`\`\`json\n${JSON.stringify(contracts, null, 2)}\n\`\`\`\n` : ""}
## TypeScript errors in ${filePath}
${errorBlock}

## Current file content
${currentContent}

Return the COMPLETE corrected file for ${filePath}.`,
    },
  ];

  const generator = await (options.complete ?? streamCompletion)(messages, {
    temperature: 0.2,
    maxTokens: options.maxTokens ?? 65536,
    lmStudioUrl: options.lmStudioUrl,
    model: options.model,
  });
  let fixedCode = await collectStream(generator);

  fixedCode = stripCodePreamble(fixedCode);
  if (fixedCode.length < 10) return false;

  const sanitized = sanitizeGeneratedCode(fixedCode, filePath);
  if (sanitized.trim() === currentContent.trim()) return false; // no change → no progress

  writeFile(projectName, filePath, sanitized);
  return true;
};
