// Plans and applies LLM-driven file edits with shared search/replace semantics and explicit JSON validation.
import { streamCompletion } from "../services/llm-proxy.js";
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
      content: `Project skeleton:\n${skeleton.summary}\n\nUser request: ${userRequest}`,
    },
  ];

  let actionJson = "";
  const analyzeGen = await streamCompletion(analyzeMessages, {
    temperature: temperature ?? 0.3,
    maxTokens: 2048,
    lmStudioUrl,
    model,
  });

  for await (const chunk of analyzeGen) {
    actionJson += chunk;
  }

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

  const generateGen = await streamCompletion(generateMessages, {
    temperature: temperature ?? 0.4,
    maxTokens: maxTokens ?? 32768,
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
  }

  // ── Install new dependencies ──────────────────────────
  if (action.newDependencies.length > 0) {
    await npmInstall(projectPath, action.newDependencies);
  }

  return { action, appliedBlocks, failedBlocks, errors };
};
