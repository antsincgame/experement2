// Generates files with contract-aware layouts, broader dependency context, and safer import normalization.
import { Project, QuoteKind, ScriptKind } from "ts-morph";
import { streamCompletion } from "../services/llm-proxy.js";
import { writeFile, readFile } from "../services/file-manager.js";
import path from "path";
import { buildProjectSkeleton, extractExportContracts, type ExportContract } from "./context-builder.js";
import type { AppPlan } from "../schemas/app-plan.schema.js";
import type { ContractViolation } from "./project-validator.js";
import { SYSTEM_GENERATOR } from "../prompts/system-generator.js";
import { getRelevantDocs } from "../prompts/knowledge-base.js";
import { broadcast } from "./event-bus.js";
import {
  BOILERPLATE_TEMPLATES,
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
import { validateAppPlan } from "./project-validator.js";

interface GeneratorOptions {
  projectName: string;
  projectPath: string;
  plan: AppPlan;
  lmStudioUrl?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  onFileStart?: (filepath: string, index: number, total: number) => void;
  onChunk?: (chunk: string) => void;
  onFileComplete?: (filepath: string) => void;
}

const normalizeImportDeclarations = (code: string): string => {
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
  } catch {
    return code;
  }
};

/** Post-process: fix common LLM mistakes that cause crashes */
const sanitizeGeneratedCode = (code: string, filePath = ""): string => {
  let result = code;

  // Strip Qwen3 thinking blocks
  result = result.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  if (result.includes("<think>")) result = result.replace(/<think>[\s\S]*/g, "").trim();

  result = result.replace(/from\s+["']@\/src\//g, 'from "@/');
  result = result.replace(/from\s*["']expo-router\/tabs["']/g, 'from "expo-router"');
  result = fixHookImports(result);
  result = fixComponentImports(result);
  result = ensureDefaultExport(result, filePath);
  result = normalizeImportDeclarations(result);

  // Fix: React.useState/useEffect/useCallback → direct import (if React not imported)
  if (result.includes("React.use") && !result.includes("import React")) {
    // Extract all React.useX calls
    const reactHooks = new Set<string>();
    const hookMatches = result.matchAll(/React\.(use\w+)/g);
    for (const m of hookMatches) reactHooks.add(m[1]);
    if (reactHooks.size > 0) {
      const hooksList = [...reactHooks].join(", ");
      // Add direct import at top
      result = `import { ${hooksList} } from "react";\n` + result;
      // Replace React.useX with useX
      for (const hook of reactHooks) {
        result = result.replace(new RegExp(`React\\.${hook}`, "g"), hook);
      }
    }
  }

  return result;
};

/** Ensure hooks and components use export default (not named export) */
const ensureDefaultExport = (code: string, filePath: string): string => {
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
const fixHookImports = (code: string): string => {
  // Match: import { useX } from "@/hooks/useX" → import useX from "@/hooks/useX"
  return code.replace(
    /import\s*\{\s*(use[A-Z]\w*)\s*\}\s*from\s*(["']@\/hooks\/[^"']+["'])/g,
    "import $1 from $2"
  );
};

/** Fix named imports of components — components use export default */
const fixComponentImports = (code: string): string => {
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

const extractCodeFromResponse = (response: string): { filepath: string; code: string } | null => {
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

export const generateFiles = async (options: GeneratorOptions): Promise<string[]> => {
  const {
    projectName,
    projectPath,
    plan,
    lmStudioUrl,
    model,
    temperature,
    maxTokens,
    onFileStart,
    onChunk,
    onFileComplete,
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
    const relevantDocs = getRelevantDocs(fileSpec.description, fileSpec.dependencies);
    broadcast({ type: "build_event", eventType: "rag_injected", message: `🧠 RAG Context loaded for ${fileSpec.path}` });

    const userMessage = `
## App Plan
${JSON.stringify(plan, null, 2)}

## Project Skeleton
${skeleton.summary}

${relevantDocs}

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

    const generator = await streamCompletion(messages, {
      temperature: temperature ?? 0.4,
      maxTokens: maxTokens ?? 65536,
      lmStudioUrl,
      model,
    });

    // Buffer chunks — send to frontend max every 100ms to prevent React re-render storm
    let chunkBuffer = "";
    let lastSendTime = Date.now();

    for await (const chunk of generator) {
      responseBuffer += chunk;
      chunkBuffer += chunk;
      if (Date.now() - lastSendTime > 100) {
        onChunk?.(chunkBuffer);
        chunkBuffer = "";
        lastSendTime = Date.now();
      }
    }
    if (chunkBuffer) onChunk?.(chunkBuffer); // flush remainder

    const extracted = extractCodeFromResponse(responseBuffer);
    if (extracted) {
      writeFile(projectName, extracted.filepath, extracted.code);
      generatedFiles.push(extracted.filepath);
      onFileComplete?.(extracted.filepath);
    } else {
      let code = responseBuffer
        .replace(/^```(?:typescript|tsx|ts|jsx|js)?\n?/, "")
        .replace(/\n?```\s*$/, "")
        .trim();

      // ALWAYS run sanitizer (bug fix: fallback was missing sanitization)
      code = sanitizeGeneratedCode(code, fileSpec.path);

      if (code.length > 10) {
        writeFile(projectName, fileSpec.path, code);
        generatedFiles.push(fileSpec.path);
        onFileComplete?.(fileSpec.path);
      } else {
        console.warn(`[Generator] Empty/tiny code for ${fileSpec.path} (${code.length} chars) — will retry via truncation check`);
        writeFile(projectName, fileSpec.path, "// EMPTY — awaiting retry\n");
        generatedFiles.push(fileSpec.path);
      }
    }
  }

  // Smart Continuation — continues truncated files from where they left off
  const MAX_TRUNCATION_RETRIES = 3;
  let truncationRetries = 0;

  while (truncationRetries < MAX_TRUNCATION_RETRIES) {
    const truncated: string[] = [];
    for (const fp of generatedFiles) {
      if (AUTO_LAYOUT_FILES.has(fp)) continue;
      if (fp === "tamagui.config.ts") continue;
      const content = readFile(projectName, fp);
      if (content && !content.includes("// EOF") && content.length > 20) {
        truncated.push(fp);
      }
    }

    if (truncated.length === 0) break;

    truncationRetries++;
    onChunk?.(`\n[Truncation detected: ${truncated.length} files — smart continuation ${truncationRetries}/${MAX_TRUNCATION_RETRIES}]\n`);
    for (const tfp of truncated) {
      broadcast({ type: "build_event", eventType: "self_healing", message: `🔄 Auto-Healing: Continuing truncated file ${tfp}` });
    }

    for (const fp of truncated) {
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

      let retryCode = "";
      const retryGen = await streamCompletion(retryMessages, {
        temperature: temperature ?? 0.3,
        maxTokens: maxTokens ?? 65536,
        lmStudioUrl,
        model,
      });

      for await (const chunk of retryGen) {
        retryCode += chunk;
      }

      // Strip markdown fences from continuation
      retryCode = retryCode
        .replace(/^```(?:tsx?|typescript)?\s*\n?/, "")
        .replace(/\n?```\s*$/, "")
        .trim();

      if (retryCode.length > 5) {
        currentContent += "\n" + retryCode;
        writeFile(projectName, fp, sanitizeGeneratedCode(currentContent, fp));
        onChunk?.(`[Smart continuation ${truncationRetries} OK: ${fp}]\n`);
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
  options: { lmStudioUrl?: string; model?: string; maxTokens?: number } = {},
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

  let fixedCode = "";

  const generator = await streamCompletion(messages, {
    temperature: 0.2,
    maxTokens: options.maxTokens ?? 65536,
    lmStudioUrl: options.lmStudioUrl,
    model: options.model,
  });

  for await (const chunk of generator) {
    fixedCode += chunk;
  }

  // Strip markdown fences and LLM preamble
  fixedCode = fixedCode.trim()
    .replace(/^```(?:tsx?|typescript)?\s*\n?/, "")
    .replace(/\n?```\s*$/, "")
    .trim();

  // Strip any non-code preamble (LLM sometimes adds "Here is the fix:" etc)
  const firstImport = fixedCode.indexOf("import ");
  const firstExport = fixedCode.indexOf("export ");
  const codeStart = Math.min(
    firstImport >= 0 ? firstImport : Infinity,
    firstExport >= 0 ? firstExport : Infinity,
  );
  if (codeStart > 0 && codeStart < Infinity) {
    fixedCode = fixedCode.slice(codeStart);
  }

  if (fixedCode.length < 10) return null;

  writeFile(projectName, filePath, sanitizeGeneratedCode(fixedCode, filePath));
  return fixedCode;
};
