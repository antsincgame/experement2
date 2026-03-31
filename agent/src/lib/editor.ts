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
  onAnalysis?: (action: EditAction) => void;
}

interface EditorResult {
  action: EditAction;
  appliedBlocks: number;
  failedBlocks: number;
  errors: string[];
}

const normalizeLine = (line: string): string => line.replace(/\s+$/g, "").replace(/\t/g, "  ");

const fuzzyLineMatch = (contentLine: string, searchLine: string): boolean => {
  if (contentLine.trim() === searchLine.trim()) return true;
  if (normalizeLine(contentLine) === normalizeLine(searchLine)) return true;
  return false;
};

const applySearchReplace = (
  content: string,
  search: string,
  replace: string
): { result: string | null; error: string | null } => {
  // Exact match
  if (content.includes(search)) {
    const count = content.split(search).length - 1;
    if (count > 1) {
      return {
        result: null,
        error: `Search block matches ${count} locations. Provide more context lines.`,
      };
    }
    return { result: content.replace(search, replace), error: null };
  }

  const contentLines = content.split("\n");
  const searchLines = search.split("\n").filter((l) => l.trim() !== "" || search.includes("\n\n"));

  // Skip empty-only search blocks
  if (searchLines.length === 0) {
    return { result: null, error: "Empty search block." };
  }

  // Fuzzy line-by-line matching (handles whitespace differences)
  for (let i = 0; i <= contentLines.length - searchLines.length; i++) {
    let matched = true;
    let contentIdx = i;
    let searchIdx = 0;

    while (searchIdx < searchLines.length && contentIdx < contentLines.length) {
      const searchLine = searchLines[searchIdx];

      // Skip blank lines in search that don't match
      if (searchLine.trim() === "" && contentLines[contentIdx].trim() !== "") {
        searchIdx++;
        continue;
      }

      if (fuzzyLineMatch(contentLines[contentIdx], searchLine)) {
        searchIdx++;
        contentIdx++;
      } else {
        matched = false;
        break;
      }
    }

    if (matched && searchIdx === searchLines.length) {
      const matchLength = contentIdx - i;
      // Detect indentation of matched block to preserve it
      const originalIndent = contentLines[i].match(/^(\s*)/)?.[1] ?? "";
      const searchIndent = searchLines[0].match(/^(\s*)/)?.[1] ?? "";

      let adjustedReplace = replace;
      if (originalIndent !== searchIndent) {
        const replaceLines = replace.split("\n");
        adjustedReplace = replaceLines.map((rl) => {
          if (rl.startsWith(searchIndent)) {
            return originalIndent + rl.slice(searchIndent.length);
          }
          return rl;
        }).join("\n");
      }

      const before = contentLines.slice(0, i);
      const after = contentLines.slice(i + matchLength);
      return {
        result: [...before, adjustedReplace, ...after].join("\n"),
        error: null,
      };
    }
  }

  // Last resort: normalized full-text match
  const normalizedContent = content.replace(/^\s+/gm, "").replace(/\s+$/gm, "");
  const normalizedSearch = search.replace(/^\s+/gm, "").replace(/\s+$/gm, "");

  if (normalizedContent.includes(normalizedSearch)) {
    const normalSearchLines = normalizedSearch.split("\n");
    for (let i = 0; i <= contentLines.length - searchLines.length; i++) {
      const slice = contentLines.slice(i, i + searchLines.length);
      const normalSlice = slice.map((l) => l.trim()).join("\n");
      if (normalSlice === normalSearchLines.join("\n")) {
        const before = contentLines.slice(0, i);
        const after = contentLines.slice(i + searchLines.length);
        return {
          result: [...before, replace, ...after].join("\n"),
          error: null,
        };
      }
    }
  }

  return {
    result: null,
    error: `Search block not found in file. Content may have changed.`,
  };
};

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
        writeFile(projectName, block.filepath, result);
        appliedBlocks++;
      } else {
        errors.push(`${block.filepath}: ${error}`);
        failedBlocks++;
      }
    } else if (block.type === "new_file" && block.content) {
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
