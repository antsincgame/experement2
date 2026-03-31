import { execSync } from "child_process";
import fs from "fs";
import { broadcast, setPreviewPort } from "../server.js";
import { createProjectFromCache } from "../services/template-cache.js";
import { startExpo, startExpoClearCache, killExpo, getActivePort, } from "../services/process-manager.js";
import { getProjectPath } from "../services/file-manager.js";
import { parseMetroError } from "../services/log-watcher.js";
import { planApp } from "./planner.js";
import { generateFiles } from "./generator.js";
import { editProject } from "./editor.js";
import { autoFix } from "./auto-fixer.js";
const gitCommit = (projectPath, message) => {
    try {
        execSync("git add -A", { cwd: projectPath, stdio: "ignore" });
        execSync(`git commit -m "${message}" --allow-empty`, {
            cwd: projectPath,
            stdio: "ignore",
        });
        const hash = execSync("git rev-parse --short HEAD", {
            cwd: projectPath,
            encoding: "utf-8",
        }).trim();
        return hash;
    }
    catch {
        return null;
    }
};
const gitInit = (projectPath) => {
    try {
        execSync("git init", { cwd: projectPath, stdio: "ignore" });
        execSync("git add -A", { cwd: projectPath, stdio: "ignore" });
        execSync('git commit -m "v1: initial generation"', {
            cwd: projectPath,
            stdio: "ignore",
        });
    }
    catch (err) {
        console.error("[Pipeline] git init failed:", err);
    }
};
export const createProject = async (options) => {
    const { description, lmStudioUrl } = options;
    // ── Step 1: Plan ──────────────────────────────────────
    broadcast({ type: "status", status: "planning" });
    const plan = await planApp({
        description,
        lmStudioUrl,
        onChunk: (chunk) => broadcast({ type: "plan_chunk", chunk }),
    });
    // Deduplicate project name
    let projectSlug = plan.name;
    let suffix = 0;
    while (fs.existsSync(getProjectPath(projectSlug))) {
        suffix++;
        projectSlug = `${plan.name}-${suffix}`;
    }
    broadcast({ type: "plan_complete", plan: { ...plan, name: projectSlug } });
    // ── Step 2: Scaffold ──────────────────────────────────
    broadcast({ type: "status", status: "scaffolding" });
    const projectPath = await createProjectFromCache(projectSlug, plan.displayName, plan.extraDependencies);
    broadcast({ type: "scaffold_complete", projectName: projectSlug });
    // ── Step 3: Generate files ────────────────────────────
    broadcast({ type: "status", status: "generating" });
    const files = await generateFiles({
        projectName: projectSlug,
        projectPath,
        plan,
        lmStudioUrl,
        onFileStart: (filepath, index, total) => broadcast({
            type: "file_generating",
            filepath,
            progress: (index + 1) / total,
        }),
        onChunk: (chunk) => broadcast({ type: "code_chunk", chunk }),
        onFileComplete: (filepath) => broadcast({ type: "file_complete", filepath }),
    });
    broadcast({ type: "generation_complete", filesCount: files.length });
    // ── Step 4: Git init ──────────────────────────────────
    gitInit(projectPath);
    // ── Step 5: Build Verification Loop ───────────────────
    broadcast({ type: "status", status: "building" });
    let buildSuccess = false;
    let buildError = null;
    let autoFixAttempts = 0;
    const MAX_BUILD_AUTOFIX = 3;
    const BUILD_TIMEOUT = 60000; // 60s for first build (Metro is slow)
    const { port: expoPort } = await startExpo(projectSlug, projectPath, (event) => {
        broadcast({ type: "build_event", eventType: event.type, message: event.message, error: event.error });
        if (event.type === "build_success") {
            buildSuccess = true;
            buildError = null;
        }
        if (event.type === "build_error" && event.error) {
            buildError = event.error;
        }
    });
    // Wait for first build result (success or error)
    await new Promise((resolve) => {
        const check = setInterval(() => {
            if (buildSuccess || buildError) {
                clearInterval(check);
                resolve();
            }
        }, 500);
        setTimeout(() => { clearInterval(check); resolve(); }, BUILD_TIMEOUT);
    });
    // Auto-fix loop: if build failed, try to fix with LLM
    while (buildError && autoFixAttempts < MAX_BUILD_AUTOFIX) {
        autoFixAttempts++;
        const parsed = parseMetroError(buildError);
        if (!parsed)
            break;
        broadcast({ type: "autofix_start", file: parsed.file, error: parsed.raw });
        const fixResult = await autoFix({
            projectName: projectSlug,
            error: { type: parsed.type, file: parsed.file, line: parsed.line, raw: parsed.raw },
            lmStudioUrl,
            maxAttempts: 1,
            onAttempt: () => broadcast({ type: "autofix_attempt", attempt: autoFixAttempts, maxAttempts: MAX_BUILD_AUTOFIX }),
            onFix: (block) => broadcast({ type: "autofix_block", filepath: block.filepath }),
        });
        if (fixResult.success) {
            broadcast({ type: "autofix_success", attempts: autoFixAttempts });
        }
        else {
            broadcast({ type: "autofix_failed", attempts: autoFixAttempts, error: fixResult.lastError });
        }
        // Wait for Metro to recompile after fix
        buildSuccess = false;
        buildError = null;
        await new Promise((resolve) => {
            const check = setInterval(() => {
                if (buildSuccess || buildError) {
                    clearInterval(check);
                    resolve();
                }
            }, 500);
            setTimeout(() => { clearInterval(check); resolve(); }, 30000);
        });
    }
    if (buildSuccess) {
        broadcast({ type: "status", status: "ready" });
    }
    else {
        broadcast({ type: "status", status: buildError ? "error" : "ready" });
    }
    setPreviewPort(expoPort || null);
    broadcast({ type: "preview_ready", port: expoPort, proxyUrl: "/preview/" });
    // Git commit the successful state
    if (buildSuccess) {
        const hash = gitCommit(projectPath, "v1: initial generation (build verified)");
        if (hash) {
            broadcast({ type: "version_created", version: 1, hash, description: description.slice(0, 60) });
        }
    }
    return { projectName: projectSlug, port: expoPort, plan };
};
export const iterateProject = async (options) => {
    const { projectName, userRequest, chatHistory, lmStudioUrl } = options;
    const projectPath = getProjectPath(projectName);
    broadcast({ type: "status", status: "analyzing" });
    const result = await editProject({
        projectName,
        userRequest,
        chatHistory,
        lmStudioUrl,
        onThinking: (text) => broadcast({ type: "thinking", content: text }),
        onAnalysis: (action) => broadcast({
            type: "analysis_complete",
            files: action.files,
            thinking: action.thinking,
        }),
        onBlock: (block) => broadcast({ type: "block_applied", filepath: block.filepath, blockType: block.type }),
    });
    if (result.appliedBlocks > 0) {
        broadcast({ type: "status", status: "validating" });
        const versionNumber = getVersionNumber(projectPath);
        const commitHash = gitCommit(projectPath, `v${versionNumber}: ${userRequest.slice(0, 60)}`);
        if (commitHash) {
            broadcast({
                type: "version_created",
                version: versionNumber,
                hash: commitHash,
                description: userRequest,
            });
        }
    }
    broadcast({
        type: "iteration_complete",
        applied: result.appliedBlocks,
        failed: result.failedBlocks,
        errors: result.errors,
    });
    return {
        appliedBlocks: result.appliedBlocks,
        failedBlocks: result.failedBlocks,
        errors: result.errors,
    };
};
export const revertVersion = async (projectName, commitHash, _lmStudioUrl) => {
    const projectPath = getProjectPath(projectName);
    const port = getActivePort(projectName);
    broadcast({ type: "reloading_preview" });
    killExpo(projectName);
    try {
        execSync("git clean -fd", { cwd: projectPath, stdio: "ignore" });
        execSync(`git checkout ${commitHash} -- .`, {
            cwd: projectPath,
            stdio: "ignore",
        });
    }
    catch (err) {
        broadcast({
            type: "system_error",
            error: `Git revert failed: ${err instanceof Error ? err.message : "unknown"}`,
        });
        return;
    }
    if (port) {
        await startExpoClearCache(projectName, projectPath, port, (event) => {
            broadcast({ type: "build_event", eventType: event.type, message: event.message, error: event.error });
        });
        setPreviewPort(port);
        broadcast({ type: "preview_ready", port, proxyUrl: "/preview/" });
    }
    else {
        broadcast({ type: "status", status: "ready" });
    }
};
// handleAutoFix removed — replaced by inline Build Verification Loop in createProject
const getVersionNumber = (projectPath) => {
    try {
        const log = execSync("git log --oneline", {
            cwd: projectPath,
            encoding: "utf-8",
        });
        return log.trim().split("\n").length + 1;
    }
    catch {
        return 1;
    }
};
//# sourceMappingURL=pipeline.js.map