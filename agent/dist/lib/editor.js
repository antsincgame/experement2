import { streamCompletion } from "../services/llm-proxy.js";
import { readFile, writeFile, deleteFile, getProjectPath, } from "../services/file-manager.js";
import { buildProjectSkeleton } from "./context-builder.js";
import { parseStream } from "./stream-parser.js";
import { EditActionSchema } from "../schemas/edit-action.schema.js";
import { SYSTEM_EDITOR_ANALYZE, SYSTEM_EDITOR_GENERATE, } from "../prompts/system-editor.js";
import { npmInstall } from "../services/process-manager.js";
const applySearchReplace = (content, search, replace) => {
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
    const normalizedContent = content.replace(/^\s+/gm, "").replace(/\s+$/gm, "");
    const normalizedSearch = search.replace(/^\s+/gm, "").replace(/\s+$/gm, "");
    if (normalizedContent.includes(normalizedSearch)) {
        const lines = content.split("\n");
        const searchLines = search.split("\n");
        const normalSearchLines = normalizedSearch.split("\n");
        for (let i = 0; i <= lines.length - searchLines.length; i++) {
            const slice = lines.slice(i, i + searchLines.length);
            const normalSlice = slice.map((l) => l.trim()).join("\n");
            if (normalSlice === normalSearchLines.join("\n")) {
                const before = lines.slice(0, i);
                const after = lines.slice(i + searchLines.length);
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
export const editProject = async (options) => {
    const { projectName, userRequest, chatHistory, lmStudioUrl, onThinking, onBlock, onAnalysis, } = options;
    const projectPath = getProjectPath(projectName);
    const skeleton = buildProjectSkeleton(projectPath);
    const recentChat = chatHistory.slice(-5);
    // ── STEP 1: Analyze ──────────────────────────────────
    const analyzeMessages = [
        { role: "system", content: SYSTEM_EDITOR_ANALYZE },
        ...recentChat.map((m) => ({ role: m.role, content: m.content })),
        {
            role: "user",
            content: `Project skeleton:\n${skeleton.summary}\n\nUser request: ${userRequest}`,
        },
    ];
    let actionJson = "";
    const analyzeGen = await streamCompletion(analyzeMessages, {
        temperature: 0.3,
        maxTokens: 2048,
        lmStudioUrl,
    });
    for await (const chunk of analyzeGen) {
        actionJson += chunk;
    }
    let action;
    try {
        const jsonMatch = actionJson.trim().match(/\{[\s\S]*\}/);
        const parsed = JSON.parse(jsonMatch?.[0] ?? actionJson);
        action = EditActionSchema.parse(parsed);
    }
    catch (err) {
        throw new Error(`Editor analysis failed: ${err instanceof Error ? err.message : "Invalid JSON"}`);
    }
    onAnalysis?.(action);
    if (action.action === "no_changes_needed") {
        return { action, appliedBlocks: 0, failedBlocks: 0, errors: [] };
    }
    // ── Read target files ─────────────────────────────────
    const targetFiles = {};
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
        { role: "system", content: SYSTEM_EDITOR_GENERATE },
        ...recentChat.map((m) => ({ role: m.role, content: m.content })),
        {
            role: "user",
            content: `Project skeleton:\n${skeleton.summary}\n\nTarget files:\n${fileContext}\n\nUser request: ${userRequest}`,
        },
    ];
    const generateGen = await streamCompletion(generateMessages, {
        temperature: 0.4,
        maxTokens: 32768,
        lmStudioUrl,
    });
    let appliedBlocks = 0;
    let failedBlocks = 0;
    const errors = [];
    for await (const item of parseStream(generateGen)) {
        if ("type" in item && item.type === "thinking") {
            onThinking?.(item.content);
            continue;
        }
        const block = item;
        onBlock?.(block);
        if (block.type === "search_replace" && block.search && block.replace) {
            const currentContent = readFile(projectName, block.filepath);
            if (!currentContent) {
                errors.push(`File not found: ${block.filepath}`);
                failedBlocks++;
                continue;
            }
            const { result, error } = applySearchReplace(currentContent, block.search, block.replace);
            if (result) {
                writeFile(projectName, block.filepath, result);
                appliedBlocks++;
            }
            else {
                errors.push(`${block.filepath}: ${error}`);
                failedBlocks++;
            }
        }
        else if (block.type === "new_file" && block.content) {
            writeFile(projectName, block.filepath, block.content);
            appliedBlocks++;
        }
        else if (block.type === "delete") {
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
//# sourceMappingURL=editor.js.map