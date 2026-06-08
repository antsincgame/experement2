// Plans and applies LLM-driven file edits with shared search/replace semantics and explicit JSON validation.
import { streamCompletion, type CompleteFn } from "../services/llm-proxy.js";
import {
  readFile,
  writeFile,
  deleteFile,
  getProjectPath,
} from "../services/file-manager.js";
import { buildProjectSkeleton } from "./context-builder.js";
import { loadPlanBrief } from "./plan-artifact.js";
import { parseStream } from "./stream-parser.js";
import { EditActionSchema, type EditAction } from "../schemas/edit-action.schema.js";
import type { SearchReplaceBlock } from "../schemas/search-replace.schema.js";
import { warnCaught } from "./catch-log.js";
import {
  SYSTEM_EDITOR_ANALYZE,
  SYSTEM_EDITOR_GENERATE,
} from "../prompts/system-editor.js";
import { npmInstall } from "../services/process-manager.js";
import { safeJsonParse } from "./json-repair.js";
import { applySearchReplace } from "./search-replace.js";
import { collectStream } from "./stream-collect.js";
import { stripThinkingFromText } from "./strip-thinking.js";

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
  const planBrief = loadPlanBrief(projectName);
  const recentChat = chatHistory.slice(-5);

  // ── STEP 1: Analyze ──────────────────────────────────
  const analyzeMessages = [
    { role: "system" as const, content: SYSTEM_EDITOR_ANALYZE },
    ...recentChat.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    {
      role: "user" as const,
      content: `/no_think\n${planBrief ? `Product blueprint:\n${planBrief}\n\n` : ""}Project skeleton:\n${skeleton.summary}\n\nUser request: ${userRequest}`,
    },
  ];

  const analyzeGen = await complete(analyzeMessages, {
    temperature: temperature ?? 0.3,
    // Headroom for reasoning models: a model that ignores /no_think spends
    // tokens thinking before the JSON action; 2048 truncated it mid-output.
    maxTokens: 8192,
    // Force a JSON object so the analyze step survives weak/thinking models that
    // would otherwise wrap the answer in prose and break parsing.
    responseFormat: { type: "json_object" },
    lmStudioUrl,
    model,
  });

  const parseAnalyzeAction = (
    raw: string,
  ): { action: EditAction | null; rawSnippet: string } => {
    const cleaned = stripThinkingFromText(raw, { preferJson: true });
    const snippet = cleaned.trim().slice(0, 400);
    const parsed = safeJsonParse(cleaned);
    if (parsed === null) {
      return { action: null, rawSnippet: snippet };
    }
    const result = EditActionSchema.safeParse(parsed);
    return {
      action: result.success ? result.data : null,
      rawSnippet: snippet,
    };
  };

  let lastSnippet = "";
  let firstPass = parseAnalyzeAction(await collectStream(analyzeGen));
  let action = firstPass.action;
  lastSnippet = firstPass.rawSnippet;

  if (!action) {
    const retryGen = await complete(
      [
        ...analyzeMessages,
        {
          role: "user" as const,
          content:
            "/no_think\nYour previous reply was not valid JSON. Respond with ONLY one JSON object matching the edit-action schema (fields: thinking, action, files, newFiles, filesToDelete, newDependencies). No markdown, no prose.",
        },
      ],
      {
        temperature: 0,
        maxTokens: 8192,
        responseFormat: { type: "json_object" },
        lmStudioUrl,
        model,
      },
    );
    const retryPass = parseAnalyzeAction(await collectStream(retryGen));
    action = retryPass.action;
    lastSnippet = retryPass.rawSnippet || lastSnippet;
  }

  if (!action) {
    throw new Error(
      `Editor analysis returned unrecoverable JSON\n${lastSnippet || "(empty model response)"}`,
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
      } catch (error) {
        warnCaught("editor", error, `batch npm install for ${valid.join(", ")}`);
        for (const dep of valid) {
          try {
            await npmInstall(getProjectPath(projectName), [dep]);
          } catch (depError) {
            warnCaught("editor", depError, `npm install ${dep}`);
          }
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

  // The analyzer lists files to CREATE in `newFiles`, but the generate step only
  // ever saw the existing target files — so the model was never told to author
  // them and the new files were silently never created. Surface them here.
  const safeNewFiles = action.newFiles.filter((file) => !isUnsafeEditPath(file.path));
  const newFilesContext =
    safeNewFiles.length > 0
      ? `\n\nFiles to CREATE (for each, output a \`filepath:\` line followed by a fenced code block with the COMPLETE file):\n${safeNewFiles
          .map((file) => `- ${file.path}: ${file.description}`)
          .join("\n")}`
      : "";

  // ── STEP 2: Generate SEARCH/REPLACE ───────────────────
  const generateMessages = [
    { role: "system" as const, content: SYSTEM_EDITOR_GENERATE },
    ...recentChat.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    {
      role: "user" as const,
      content: `Project skeleton:\n${skeleton.summary}\n\nTarget files:\n${fileContext}${newFilesContext}\n\nUser request: ${userRequest}`,
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

  // Silent no-op guard: we only reach the generate step when edits WERE expected
  // (action.files.length > 0). If it produced nothing at all — no applied block, no
  // failure — the model's output didn't parse as filepath:/SEARCH-REPLACE (it returned
  // prose, a unified diff, or a fenced block with no filepath). Surface a clear,
  // actionable error instead of returning a silent "0 changes" that the UI renders as
  // nothing (the symptom: you ask for an edit and get total silence).
  if (appliedBlocks === 0 && failedBlocks === 0 && errors.length === 0) {
    failedBlocks = 1;
    errors.push(
      "Could not apply any changes: the model did not return a parseable edit (expected a `filepath:` line followed by a SEARCH/REPLACE block, or a fenced new file). Try rephrasing your request more specifically.",
    );
  }

  return { action, appliedBlocks, failedBlocks, errors };
};
