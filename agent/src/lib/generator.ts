import { streamCompletion } from "../services/llm-proxy.js";
import { writeFile, readFile } from "../services/file-manager.js";
import { buildProjectSkeleton } from "./context-builder.js";
import type { AppPlan } from "../schemas/app-plan.schema.js";
import { SYSTEM_GENERATOR } from "../prompts/system-generator.js";
import { BOILERPLATE_TEMPLATES } from "../prompts/templates.js";

interface GeneratorOptions {
  projectName: string;
  projectPath: string;
  plan: AppPlan;
  lmStudioUrl?: string;
  onFileStart?: (filepath: string, index: number, total: number) => void;
  onChunk?: (chunk: string) => void;
  onFileComplete?: (filepath: string) => void;
}

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

  for (const [templatePath, templateContent] of Object.entries(BOILERPLATE_TEMPLATES)) {
    const alreadyInPlan = plan.files.some((f) => f.path === templatePath);
    if (!alreadyInPlan) {
      writeFile(projectName, templatePath, templateContent);
      generatedFiles.push(templatePath);
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
      const code = responseBuffer
        .replace(/^```(?:typescript|tsx|ts|jsx|js)?\n?/, "")
        .replace(/\n?```\s*$/, "")
        .trim();

      if (code.length > 10) {
        writeFile(projectName, fileSpec.path, code);
        generatedFiles.push(fileSpec.path);
        onFileComplete?.(fileSpec.path);
      }
    }
  }

  return generatedFiles;
};
