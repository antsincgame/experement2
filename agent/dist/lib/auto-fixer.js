// Applies Metro-driven autofix blocks with the same safe matching rules used by the main editor.
import { streamCompletion } from "../services/llm-proxy.js";
import { readFile, writeFile, getProjectPath } from "../services/file-manager.js";
import { buildProjectSkeleton } from "./context-builder.js";
import { parseStream } from "./stream-parser.js";
import { SYSTEM_AUTOFIX } from "../prompts/system-editor.js";
import { applySearchReplace } from "./search-replace.js";
const applyBlock = (projectName, block) => {
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
export const autoFix = async (options) => {
    const { projectName, error, lmStudioUrl, maxAttempts = 3, onAttempt, onFix, } = options;
    const projectPath = getProjectPath(projectName);
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        onAttempt?.(attempt, maxAttempts);
        const skeleton = buildProjectSkeleton(projectPath);
        const fileContent = readFile(projectName, error.file) ?? "// file not found";
        const messages = [
            { role: "system", content: SYSTEM_AUTOFIX },
            {
                role: "user",
                content: `Project skeleton:\n${skeleton.summary}\n\nFile with error:\n// === ${error.file} ===\n${fileContent}\n\nMetro error:\n${error.raw}\n\nFix this error with SEARCH/REPLACE blocks.`,
            },
        ];
        const generator = await streamCompletion(messages, {
            temperature: 0.2,
            maxTokens: 4096,
            lmStudioUrl,
        });
        let blocksApplied = 0;
        for await (const item of parseStream(generator)) {
            if ("type" in item && item.type === "thinking")
                continue;
            const block = item;
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
//# sourceMappingURL=auto-fixer.js.map