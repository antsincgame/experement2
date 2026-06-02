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

/**
 * Maps a raw Metro/TypeScript error string to a targeted fix hint for the LLM.
 * Exported for testing; returns "" when no specific hint applies.
 */
export const getErrorHint = (raw: string): string => {
  if (raw.includes("TS2322") && raw.includes("is not assignable to type") && raw.includes("_layout.tsx")) {
    return "HINT: Icons come from the UI kit — import { Icon } from '@/ui' and use <Icon name=\"...\" />. The name prop is a plain string, so no icon name is ever invalid; replace any raw vector-icons usage with <Icon> from '@/ui'.";
  }
  if (raw.includes("TS2322") && raw.includes("is not assignable to type")) {
    return "HINT: A prop value does not match the expected type. Check the target component's Props. For icons use <Icon name=\"...\" /> from '@/ui' (name is any string).";
  }
  if (raw.includes("TS2304") || raw.includes("TS2552")) {
    return "HINT: You forgot to import a type, interface, or component. Add the missing import statement at the top of the file.";
  }
  if (raw.includes("TS2305")) {
    return "HINT: You imported a member that does not exist in the module. Pressable does NOT exist in 'tamagui' — import it from 'react-native'. View/Text do NOT exist in 'tamagui' — use YStack/XStack/Text from 'tamagui'.";
  }
  return "";
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

    const errorHint = getErrorHint(error.raw);

    const messages = [
      { role: "system" as const, content: SYSTEM_AUTOFIX },
      {
        role: "user" as const,
        content: `Project skeleton:\n${skeleton.summary}\n\nFile with error:\n// === ${error.file} ===\n${fileContent}\n\nMetro/TypeScript error:\n${error.raw}\n${errorHint}\n\nFix this error with SEARCH/REPLACE blocks. DO NOT change anything else.`,
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
