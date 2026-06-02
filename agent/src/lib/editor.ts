// Plans and applies LLM-driven file edits with shared search/replace semantics and explicit JSON validation.
import { streamCompletion, type CompleteFn } from "../services/llm-proxy.js";
import {
  readFile,
  writeFile,
  deleteFile,
  getProjectPath,
} from "../services/file-manager.js";
import { buildProjectSkeleton } from "./context-builder.js";
import { parseStream } from "./stream-parser.js";
import { EditActionSchema, type EditAction } from "../schemas/edit-action.schema.js";
import type { SearchReplaceBlock } from "../schemas/search-replace.schema.js";
import {
  SYSTEM_EDITOR_ANALYZE,
  SYSTEM_EDITOR_GENERATE,
} from "../prompts/system-editor.js";
import { npmInstall } from "../services/process-manager.js";
import { safeJsonParse } from "./json-repair.js";
import { applySearchReplace } from "./search-replace.js";
import { collectStream } from "./stream-collect.js";

/**
 * Guards LLM-proposed paths before they reach the file system. A malformed path
 * (absolute, parent-traversal, or pointing into node_modules/.git/.expo/dist)
 * must be skipped — not thrown — so one bad block never aborts the whole edit.
 * Without this, an echoed stack-trace path (e.g. node_modules/esbuild-register)
 * crashed the entire "Fix Error" iteration with a cryptic "Invalid file path".
 */
export const isUnsafeEditPath = (filepath: string): boolean => {
  const normalized = filepath.replace(/\\/g, "/").trim();
  if (!normalized) return true;
  if (/^(?:[a-zA-Z]:\/|\/)/.test(normalized)) return true;
  if (normalized.split("/").some((segment) => segment === "..")) return true;
  return /(?:^|\/)(?:node_modules|\.git|\.expo|dist)(?:\/|$)/.test(normalized);
};

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface EditorOptions {
  projectName: string;
  userRequest: string;
  chatHistory: ChatMessage[];
  lmStudioUrl?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  /** Model-completion seam; defaults to the real streamCompletion. */
  complete?: CompleteFn;
  onThinking?: (text: string) => void;
  onBlock?: (block: SearchReplaceBlock) => void;
  onDiff?: (filepath: string, before: string, after: string) => void;
  onAnalysis?: (action: EditAction) => void;
}

interface EditorResult {
  action: EditAction;
  appliedBlocks: number;
  failedBlocks: number;
  errors: string[];
}

export const editProject = async (
  options: EditorOptions
): Promise<EditorResult> => {
  const {
    projectName,
    userRequest,
    chatHistory,
    lmStudioUrl,
    model,
    temperature,
    maxTokens,
    topP,
    complete = streamCompletion,
    onThinking,
    onBlock,
    onDiff,
    onAnalysis,
  } = options;

  const projectPath = getProjectPath(projectName);
  const skeleton = buildProjectSkeleton(projectPath);
  const recentChat = chatHistory.slice(-5);

  // ── STEP 1: Analyze ──────────────────────────────────
  const analyzeMessages = [
    { role: "system" as const, content: SYSTEM_EDITOR_ANALYZE },
    ...recentChat.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    {
      role: "user" as const,
      content: `/no_think\nProject skeleton:\n${skeleton.summary}\n\nUser request: ${userRequest}`,
    },
  ];

  const analyzeGen = await complete(analyzeMessages, {
    temperature: temperature ?? 0.3,
    maxTokens: 2048,
    lmStudioUrl,
    model,
  });

  const actionJson = await collectStream(analyzeGen);

  let action: EditAction;
  try {
    const parsed = safeJsonParse(actionJson);
    if (parsed === null) {
      throw new Error("Editor analysis returned unrecoverable JSON");
    }
    action = EditActionSchema.parse(parsed);
  } catch (err) {
    throw new Error(
      `Editor analysis failed: ${err instanceof Error ? err.message : "Invalid JSON"}\n${actionJson.slice(0, 300)}`
    );
  }

  onAnalysis?.(action);

  if (action.action === "no_changes_needed") {
    return { action, appliedBlocks: 0, failedBlocks: 0, errors: [] };
  }

  // Handle install_package: install deps first, then read files and generate changes
  if (action.action === "install_package" && action.newDependencies.length > 0) {
    const { validateDependencies } = await import("./dependency-validator.js");
    const { valid, rejected } = await validateDependencies(action.newDependencies);
    if (rejected.length > 0) {
      console.warn(`[Editor] Rejected deps: ${rejected.join(", ")}`);
    }
    if (valid.length > 0) {
      try {
        await npmInstall(getProjectPath(projectName), valid);
      } catch {
        for (const dep of valid) {
          try { await npmInstall(getProjectPath(projectName), [dep]); } catch { /* skip */ }
        }
      }
    }
    // If there are also files to edit, continue; otherwise treat as done
    if (action.files.length === 0) {
      return { action, appliedBlocks: 0, failedBlocks: 0, errors: [] };
    }
  }

  // ── Read target files ─────────────────────────────────
  const targetFiles: Record<string, string> = {};
  for (const filepath of action.files) {
    if (isUnsafeEditPath(filepath)) {
      continue;
    }
    const content = readFile(projectName, filepath);
    if (content) {
      targetFiles[filepath] = content;
    }
  }

  const fileContext = Object.entries(targetFiles)
    .map(([fp, code]) => `// === ${fp} ===\n${code}`)
    .join("\n\n");

  // ── STEP 2: Generate SEARCH/REPLACE ───────────────────
  const generateMessages = [
    { role: "system" as const, content: SYSTEM_EDITOR_GENERATE },
    ...recentChat.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    {
      role: "user" as const,
      content: `Project skeleton:\n${skeleton.summary}\n\nTarget files:\n${fileContext}\n\nUser request: ${userRequest}`,
    },
  ];

  const generateGen = await complete(generateMessages, {
    temperature: temperature ?? 0.4,
    maxTokens: maxTokens ?? 65536,
    topP,
    lmStudioUrl,
    model,
  });

  let appliedBlocks = 0;
  let failedBlocks = 0;
  const errors: string[] = [];

  for await (const item of parseStream(generateGen)) {
    if ("type" in item && item.type === "thinking") {
      onThinking?.((item as { type: "thinking"; content: string }).content);
      continue;
    }

    const block = item as SearchReplaceBlock;
    onBlock?.(block);

    if (isUnsafeEditPath(block.filepath)) {
      errors.push(`Skipped unsafe path: ${block.filepath}`);
      failedBlocks++;
      continue;
    }

    try {
      if (block.type === "search_replace" && block.search && block.replace) {
        const currentContent = readFile(projectName, block.filepath);
        if (!currentContent) {
          errors.push(`File not found: ${block.filepath}`);
          failedBlocks++;
          continue;
        }

        const { result, error } = applySearchReplace(
          currentContent,
          block.search,
          block.replace
        );

        if (result) {
          onDiff?.(block.filepath, currentContent, result);
          writeFile(projectName, block.filepath, result);
          appliedBlocks++;
        } else {
          errors.push(`${block.filepath}: ${error}`);
          failedBlocks++;
        }
      } else if (block.type === "new_file" && block.content) {
        onDiff?.(block.filepath, "", block.content);
        writeFile(projectName, block.filepath, block.content);
        appliedBlocks++;
      } else if (block.type === "delete") {
        deleteFile(projectName, block.filepath);
        appliedBlocks++;
      }
    } catch (err) {
      errors.push(
        `${block.filepath}: ${err instanceof Error ? err.message : "write failed"}`
      );
      failedBlocks++;
    }
  }

  // ── Delete files the analysis flagged for removal ─────
  for (const filepath of action.filesToDelete) {
    if (isUnsafeEditPath(filepath)) {
      continue;
    }
    if (deleteFile(projectName, filepath)) {
      onBlock?.({ filepath, type: "delete" });
      appliedBlocks++;
    }
  }

  // ── Install new dependencies (validated; install_package already did this) ─
  if (action.action !== "install_package" && action.newDependencies.length > 0) {
    const { validateDependencies } = await import("./dependency-validator.js");
    const { valid, rejected } = await validateDependencies(action.newDependencies);
    if (rejected.length > 0) {
      console.warn(`[Editor] Rejected deps: ${rejected.join(", ")}`);
    }
    if (valid.length > 0) {
      await npmInstall(projectPath, valid);
    }
  }

  return { action, appliedBlocks, failedBlocks, errors };
};
