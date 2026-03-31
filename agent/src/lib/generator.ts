import { streamCompletion } from "../services/llm-proxy.js";
import { writeFile, readFile } from "../services/file-manager.js";
import { buildProjectSkeleton } from "./context-builder.js";
import type { AppPlan } from "../schemas/app-plan.schema.js";
import { SYSTEM_GENERATOR } from "../prompts/system-generator.js";
import { BOILERPLATE_TEMPLATES, getRootLayout } from "../prompts/templates.js";

interface GeneratorOptions {
  projectName: string;
  projectPath: string;
  plan: AppPlan;
  lmStudioUrl?: string;
  onFileStart?: (filepath: string, index: number, total: number) => void;
  onChunk?: (chunk: string) => void;
  onFileComplete?: (filepath: string) => void;
}

/** Post-process: fix common LLM mistakes that cause crashes */
const sanitizeGeneratedCode = (code: string): string => {
  let result = code;

  // Fix: @/src/components → @/components (double src)
  result = result.replace(/from\s+["']@\/src\//g, 'from "@/');

  // Fix: import { Tabs } from "expo-router/tabs" → "expo-router"
  result = result.replace(/from\s+["']expo-router\/tabs["']/g, 'from "expo-router"');

  // Fix: import { Ionicons } from "@expo/vector-icons" → default import
  result = result.replace(
    /import\s*\{\s*Ionicons\s*\}\s*from\s*["']@expo\/vector-icons["']/g,
    'import Ionicons from "@expo/vector-icons/Ionicons"'
  );

  // Fix: import { MaterialIcons } from "@expo/vector-icons" → default import
  result = result.replace(
    /import\s*\{\s*MaterialIcons\s*\}\s*from\s*["']@expo\/vector-icons["']/g,
    'import MaterialIcons from "@expo/vector-icons/MaterialIcons"'
  );

  // Fix: import { FontAwesome } from "@expo/vector-icons" → default import
  result = result.replace(
    /import\s*\{\s*FontAwesome\s*\}\s*from\s*["']@expo\/vector-icons["']/g,
    'import FontAwesome from "@expo/vector-icons/FontAwesome"'
  );

  // Fix: import { AntDesign } from "@expo/vector-icons" → default import
  result = result.replace(
    /import\s*\{\s*AntDesign\s*\}\s*from\s*["']@expo\/vector-icons["']/g,
    'import AntDesign from "@expo/vector-icons/AntDesign"'
  );

  // Fix: import { Home, Settings, ... } from "@expo/vector-icons" → remove (these don't exist)
  // Replace with Ionicons default import
  result = result.replace(
    /import\s*\{[^}]+\}\s*from\s*["']@expo\/vector-icons["']\s*;?/g,
    'import Ionicons from "@expo/vector-icons/Ionicons";'
  );

  // Fix: import { Tabs } from "expo-router/tabs" → "expo-router"
  result = result.replace(/from\s*["']expo-router\/tabs["']/g, 'from "expo-router"');

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
  code = sanitizeGeneratedCode(code);

  return { filepath, code };
};

export const generateFiles = async (options: GeneratorOptions): Promise<string[]> => {
  const {
    projectName,
    projectPath,
    plan,
    lmStudioUrl,
    onFileStart,
    onChunk,
    onFileComplete,
  } = options;

  const generatedFiles: string[] = [];

  // Write static boilerplate (config files)
  for (const [templatePath, templateContent] of Object.entries(BOILERPLATE_TEMPLATES)) {
    const alreadyInPlan = plan.files.some((f) => f.path === templatePath);
    if (!alreadyInPlan) {
      writeFile(projectName, templatePath, templateContent);
      generatedFiles.push(templatePath);
    }
  }

  // Write dynamic root layout (Stack or Tabs based on navigation type)
  const navType = plan.navigation?.type ?? "stack";
  const layoutPath = navType === "tabs" ? "app/(tabs)/_layout.tsx" : "app/_layout.tsx";
  const hasLayoutInPlan = plan.files.some((f) => f.path === layoutPath || f.path === "app/_layout.tsx");
  if (!hasLayoutInPlan) {
    writeFile(projectName, layoutPath, getRootLayout(navType));
    generatedFiles.push(layoutPath);
    // For tabs: also write root _layout.tsx that just re-exports
    if (navType === "tabs") {
      writeFile(projectName, "app/_layout.tsx", `import "../src/global.css";\nimport { Slot } from "expo-router";\nimport { StatusBar } from "expo-status-bar";\n\nexport default function RootLayout() {\n  return (\n    <>\n      <StatusBar style="dark" />\n      <Slot />\n    </>\n  );\n}\n`);
      generatedFiles.push("app/_layout.tsx");
    }
  }

  const totalFiles = plan.files.length;

  for (let i = 0; i < totalFiles; i++) {
    const fileSpec = plan.files[i];
    onFileStart?.(fileSpec.path, i, totalFiles);

    const skeleton = buildProjectSkeleton(projectPath);

    const depContents: string[] = [];
    for (const depPath of fileSpec.dependencies.slice(0, 3)) {
      const content = readFile(projectName, depPath);
      if (content) {
        depContents.push(`// --- ${depPath} ---\n${content}`);
      }
    }

    const userMessage = `
## App Plan
${JSON.stringify(plan, null, 2)}

## Project Skeleton
${skeleton.summary}

## Target File
Path: ${fileSpec.path}
Type: ${fileSpec.type}
Description: ${fileSpec.description}

## Dependencies (full code)
${depContents.length > 0 ? depContents.join("\n\n") : "None yet"}

Generate the complete code for: ${fileSpec.path}`;

    const messages = [
      { role: "system" as const, content: SYSTEM_GENERATOR },
      { role: "user" as const, content: userMessage },
    ];

    let responseBuffer = "";

    const generator = await streamCompletion(messages, {
      temperature: 0.4,
      maxTokens: 32768,
      lmStudioUrl,
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
      code = sanitizeGeneratedCode(code);

      if (code.length > 10) {
        writeFile(projectName, fileSpec.path, code);
        generatedFiles.push(fileSpec.path);
        onFileComplete?.(fileSpec.path);
      }
    }
  }

  return generatedFiles;
};
