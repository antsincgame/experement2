// Applies Metro-driven autofix blocks with the same safe matching rules used by the main editor.
import { streamCompletion, type CompleteFn } from "../services/llm-proxy.js";
import { readFile, writeFile, getProjectPath } from "../services/file-manager.js";
import { buildProjectSkeleton } from "./context-builder.js";
import { parseStream } from "./stream-parser.js";
import type { SearchReplaceBlock } from "../schemas/search-replace.schema.js";
import { SYSTEM_AUTOFIX } from "../prompts/system-editor.js";
import { applySearchReplace } from "./search-replace.js";
import { isUnsafeEditPath } from "./editor.js";
import { getBareModuleName } from "./generation-contract.js";
import { findSimilarFixes, buildPastFixBlock } from "./error-fix-store.js";
import { applyDeterministicCodeRepairs } from "./code-style-repairs.js";
import { toEditableProjectPath } from "./project-file-path.js";
import { warnCaught } from "./catch-log.js";

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
  /** Model-completion seam; defaults to the real streamCompletion. */
  complete?: CompleteFn;
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

  // A weak model often echoes the error's stack trace and proposes an absolute or
  // node_modules path (e.g. esbuild-register). Reject it here so file-manager never
  // throws "Invalid file path" and crashes the whole autofix run.
  if (isUnsafeEditPath(block.filepath)) {
    return false;
  }

  try {
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
  } catch (error) {
    warnCaught("auto-fixer", error, `apply search/replace to ${block.filepath}`);
    return false;
  }
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
  if (raw.includes("Invalid shorthand property initializer") || raw.includes("TS1312")) {
    return 'HINT: Inside pressStyle/hoverStyle object literals use colons: `bg: "$gray2"` not `bg="$gray2"`. Tamagui Separator uses `vertical` prop, not `orientation="vertical"`.';
  }
  return "";
};

export const autoFix = async (options: AutoFixOptions): Promise<AutoFixResult> => {
  const {
    projectName,
    error,
    lmStudioUrl,
    model,
    complete = streamCompletion,
    maxAttempts = 3,
    onAttempt,
    onFix,
  } = options;

  const projectPath = getProjectPath(projectName);

  const resolvedFile = toEditableProjectPath(error.file) || error.file?.trim() || "";
  const errorForFix = { ...error, file: resolvedFile };

  // Non-actionable errors (Metro timeouts, crashes with no source location) parse to
  // file "unknown". Feeding those to the model just produces garbage SEARCH/REPLACE
  // blocks (often echoing stack-trace paths), so bail out early with a clear reason.
  const targetFile = resolvedFile;
  if (!targetFile || targetFile === "unknown" || isUnsafeEditPath(targetFile)) {
    // When the failing file is inside node_modules, the bundle broke in a dependency,
    // not project code — autofix can't edit it. Most often a native-only module that
    // isn't web-safe (the scaffold's metro.config aliases the known ones to a web stub;
    // an unknown one slipping through lands here). Surface a clear, named reason and
    // bail instantly instead of wasting an attempt and timing out Metro on a recompile.
    const normalized = targetFile?.replace(/\\/g, "/");
    if (normalized && /(?:^|\/)node_modules(?:\/|$)/.test(normalized)) {
      const moduleName = getBareModuleName(normalized.split("node_modules/").pop() ?? normalized);
      return {
        success: false,
        attempts: 0,
        lastError: `A dependency is not web-compatible and broke the preview (${moduleName}). It needs a web-safe stub for the Expo web bundle.`,
      };
    }
    return {
      success: false,
      attempts: 0,
      lastError: `Autofix skipped: error has no editable source file (${error.type || "unknown error"}).`,
    };
  }

  const existing = readFile(projectName, targetFile);
  if (existing) {
    const repaired = applyDeterministicCodeRepairs(existing);
    if (repaired !== existing) {
      writeFile(projectName, targetFile, repaired);
      return { success: true, attempts: 0 };
    }
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    onAttempt?.(attempt, maxAttempts);

    const skeleton = buildProjectSkeleton(projectPath);
    const fileContent = readFile(projectName, targetFile) ?? "// file not found";

    const errorHint = getErrorHint(errorForFix.raw);

    // Surface a concrete "this error → this fix" exemplar from past successful
    // autofixes. Advisory only: no match means an empty string and a byte-identical prompt.
    const pastFix = buildPastFixBlock(
      findSimilarFixes(errorForFix.raw, { file: targetFile })
    );
    const pastFixBlock = pastFix ? `${pastFix}\n\n` : "";

    const messages = [
      { role: "system" as const, content: SYSTEM_AUTOFIX },
      {
        role: "user" as const,
        content: `/no_think\n${pastFixBlock}Project skeleton:\n${skeleton.summary}\n\nFile with error:\n// === ${targetFile} ===\n${fileContent}\n\nMetro/TypeScript error:\n${errorForFix.raw}\n${errorHint}\n\nFix this error with SEARCH/REPLACE blocks. DO NOT change anything else.`,
      },
    ];

    const generator = await complete(messages, {
      temperature: 0.2,
      // Headroom so a reasoning model that ignores /no_think still emits the
      // SEARCH/REPLACE blocks after its thinking instead of being truncated.
      maxTokens: 8192,
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
