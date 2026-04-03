// Generates files with contract-aware layouts, broader dependency context, and safer import normalization.
import { Project, QuoteKind, ScriptKind } from "ts-morph";
import { streamCompletion } from "../services/llm-proxy.js";
import { writeFile, readFile } from "../services/file-manager.js";
import path from "path";
import { buildProjectSkeleton, extractExportContracts, type ExportContract } from "./context-builder.js";
import type { AppPlan } from "../schemas/app-plan.schema.js";
import type { ContractViolation } from "./project-validator.js";
import { SYSTEM_GENERATOR } from "../prompts/system-generator.js";
import {
  BOILERPLATE_TEMPLATES,
  getRootLayout,
  getTabsLayout,
} from "../prompts/templates.js";
import {
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

  const totalFiles = plan.files.length;

  // Auto-generated layout files — skip if LLM plan includes them
  const AUTO_LAYOUT_FILES = new Set(["app/_layout.tsx", "app/(tabs)/_layout.tsx"]);

  for (let i = 0; i < totalFiles; i++) {
    const fileSpec = plan.files[i];

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

    const userMessage = `
## App Plan
${JSON.stringify(plan, null, 2)}

## Project Skeleton
${skeleton.summary}

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
      { role: "user" as const, content: userMessage },
    ];

    let responseBuffer = "";

    const generator = await streamCompletion(messages, {
      temperature: temperature ?? 0.4,
      maxTokens: maxTokens ?? 65536,
      lmStudioUrl,
      model,
    });

    for await (const chunk of generator) {
      responseBuffer += chunk;
      onChunk?.(chunk);
    }

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
      }
    }
  }

  // Check for truncated files (missing // EOF marker)
  for (const fp of generatedFiles) {
    if (AUTO_LAYOUT_FILES.has(fp)) continue;
    const content = readFile(projectName, fp);
    if (content && !content.includes("// EOF")) {
      // File may be truncated — strip marker if present elsewhere and note it
      // For now just log, Fixer will handle in contract validation step
    }
  }

  return generatedFiles;
};

// ── Contract Auto-Fix: regenerate a single file with violation context ──

export const regenerateFileWithContracts = async (
  projectName: string,
  projectPath: string,
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
      content: `You are fixing a React Native TypeScript file that violated export/import contracts.
Return ONLY the corrected code. No markdown fences. No explanations.

AVAILABLE CONTRACTS:
\`\`\`json
${JSON.stringify(contracts, null, 2)}
\`\`\`

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

  // Strip markdown fences if LLM added them
  fixedCode = fixedCode.trim()
    .replace(/^```(?:tsx?|typescript)?\s*\n?/, "")
    .replace(/\n?```\s*$/, "")
    .trim();

  if (fixedCode.length < 10) return null;

  writeFile(projectName, filePath, sanitizeGeneratedCode(fixedCode, filePath));
  return fixedCode;
};
