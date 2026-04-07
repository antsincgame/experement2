// Applies Metro-driven autofix blocks with the same safe matching rules used by the main editor.
import { streamCompletion } from "../services/llm-proxy.js";
import { readFile, writeFile, getProjectPath } from "../services/file-manager.js";
import { buildProjectSkeleton } from "./context-builder.js";
import { parseStream } from "./stream-parser.js";
import type { SearchReplaceBlock } from "../schemas/search-replace.schema.js";
import { SYSTEM_AUTOFIX } from "../prompts/system-editor.js";
import { applySearchReplace } from "./search-replace.js";

export interface MetroError {
  type: string;
  file: string;
  line: string;
  raw: string;
}

interface AutoFixOptions {
  projectName: string;
  error: MetroError;
  lmStudioUrl?: string;
  model?: string;
  maxAttempts?: number;
  onAttempt?: (attempt: number, maxAttempts: number) => void;
  onFix?: (block: SearchReplaceBlock) => void;
}

interface AutoFixResult {
  success: boolean;
  attempts: number;
  lastError?: string;
}

const applyBlock = (
  projectName: string,
  block: SearchReplaceBlock
): boolean => {
  if (block.type !== "search_replace" || !block.search || !block.replace) {
    return false;
  }

  const content = readFile(projectName, block.filepath);
  if (!content) {
    return false;
  }

  const { result } = applySearchReplace(content, block.search, block.replace);
  if (!result || result === content) {
    return false;
  }

  writeFile(projectName, block.filepath, result);
  return true;
};

export const autoFix = async (options: AutoFixOptions): Promise<AutoFixResult> => {
  const {
    projectName,
    error,
    lmStudioUrl,
    model,
    maxAttempts = 3,
    onAttempt,
    onFix,
  } = options;

  const projectPath = getProjectPath(projectName);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    onAttempt?.(attempt, maxAttempts);

    const skeleton = buildProjectSkeleton(projectPath);
    const fileContent = readFile(projectName, error.file) ?? "// file not found";

    const messages = [
      { role: "system" as const, content: SYSTEM_AUTOFIX },
      {
        role: "user" as const,
        content: `Project skeleton:\n${skeleton.summary}\n\nFile with error:\n// === ${error.file} ===\n${fileContent}\n\nMetro error:\n${error.raw}\n\nFix this error with SEARCH/REPLACE blocks.`,
      },
    ];

    const generator = await streamCompletion(messages, {
      temperature: 0.2,
      maxTokens: 4096,
      lmStudioUrl,
      model,
    });

    let blocksApplied = 0;

    for await (const item of parseStream(generator)) {
      if ("type" in item && item.type === "thinking") continue;

      const block = item as SearchReplaceBlock;
      onFix?.(block);

      if (applyBlock(projectName, block)) {
        blocksApplied++;
      }
    }

    if (blocksApplied > 0) {
      return { success: true, attempts: attempt };
    }
  }

  return {
    success: false,
    attempts: maxAttempts,
    lastError: error.raw,
  };
};
