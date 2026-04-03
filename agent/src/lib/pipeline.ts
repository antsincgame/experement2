// Verifies generated projects with deterministic validation gates and event-bus updates before previewing.
import { spawnSync } from "child_process";
import fs from "fs";
import { broadcast, setPreviewPort } from "./event-bus.js";
import { createProjectFromCache } from "../services/template-cache.js";
import {
  startExpo,
  startExpoClearCache,
  killExpo,
  getActivePort,
  runNativeSmoke,
  runTypecheck,
  runWebExport,
} from "../services/process-manager.js";
import { getProjectPath } from "../services/file-manager.js";
import { parseMetroError } from "../services/log-watcher.js";
import { planApp } from "./planner.js";
import { generateFiles } from "./generator.js";
import { editProject } from "./editor.js";
import { autoFix } from "./auto-fixer.js";
import type { AppPlan } from "../schemas/app-plan.schema.js";
import { validateGeneratedProject } from "./project-validator.js";
import type { SupportedNavigationType } from "./generation-contract.js";

interface CreateOptions {
  description: string;
  lmStudioUrl?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  onProjectNameResolved?: (projectName: string) => void;
}

interface CreateResult {
  projectName: string;
  port: number;
  plan: AppPlan;
}

interface IterateOptions {
  projectName: string;
  userRequest: string;
  chatHistory: Array<{ role: "user" | "assistant"; content: string }>;
  lmStudioUrl?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

interface IterateResult {
  appliedBlocks: number;
  failedBlocks: number;
  errors: string[];
}

interface GateResult {
  success: boolean;
  errors: string[];
}

const GIT_HASH_PATTERN = /^[a-f0-9]{7,64}$/i;

const runGitCommand = (
  projectPath: string,
  args: string[],
  options: { allowFailure?: boolean } = {}
): string => {
  const result = spawnSync("git", args, {
    cwd: projectPath,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  if (result.error) {
    throw result.error;
  }

  if ((result.status ?? 1) !== 0 && !options.allowFailure) {
    const output = [result.stdout, result.stderr]
      .filter(Boolean)
      .join("\n")
      .trim();
    throw new Error(output || `git ${args.join(" ")} failed`);
  }

  return result.stdout?.trim() ?? "";
};

const gitCommit = (projectPath: string, message: string): string | null => {
  try {
    runGitCommand(projectPath, ["add", "-A"]);
    runGitCommand(projectPath, ["commit", "-m", message, "--allow-empty"]);
    return runGitCommand(projectPath, ["rev-parse", "--short", "HEAD"]);
  } catch {
    return null;
  }
};

const gitInit = (projectPath: string): void => {
  try {
    runGitCommand(projectPath, ["init"]);
    runGitCommand(projectPath, ["add", "-A"]);
    runGitCommand(projectPath, ["commit", "-m", "v1: initial generation"]);
  } catch (err) {
    console.warn("[Pipeline] git init failed:", err);
  }
};

const summarizeOutput = (output: string): string =>
  output.trim().split("\n").slice(-12).join("\n").trim();

const waitForBuildOutcome = async (
  timeoutMs: number,
  hasOutcome: () => boolean
): Promise<void> => {
  await new Promise<void>((resolve) => {
    let settled = false;

    const finish = (
      intervalId: ReturnType<typeof setInterval>,
      timeoutId: ReturnType<typeof setTimeout>
    ): void => {
      if (settled) {
        return;
      }

      settled = true;
      clearInterval(intervalId);
      clearTimeout(timeoutId);
      resolve();
    };

    const intervalId = setInterval(() => {
      if (hasOutcome()) {
        finish(intervalId, timeoutId);
      }
    }, 500);
    const timeoutId = setTimeout(() => finish(intervalId, timeoutId), timeoutMs);

    if (hasOutcome()) {
      finish(intervalId, timeoutId);
    }
  });
};

const runProjectQualityGates = async (
  projectPath: string,
  navigationType?: SupportedNavigationType
): Promise<GateResult> => {
  const errors: string[] = [];
  const staticIssues = validateGeneratedProject(
    projectPath,
    navigationType ?? undefined
  );

  if (staticIssues.length > 0) {
    errors.push(
      `Static validation failed: ${staticIssues
        .map((issue) => `${issue.filePath ?? "project"}: ${issue.message}`)
        .join("; ")}`
    );
    return { success: false, errors };
  }

  const typecheckResult = await runTypecheck(projectPath);
  if (!typecheckResult.success) {
    errors.push(
      `Typecheck failed:\n${summarizeOutput(typecheckResult.combinedOutput)}`
    );
    return { success: false, errors };
  }

  const webExportResult = await runWebExport(projectPath);
  if (!webExportResult.success) {
    errors.push(
      `Web export failed:\n${summarizeOutput(webExportResult.combinedOutput)}`
    );
    return { success: false, errors };
  }

  const androidSmokeResult = await runNativeSmoke(projectPath, "android");
  if (!androidSmokeResult.success) {
    errors.push(
      `Android smoke gate failed:\n${summarizeOutput(
        androidSmokeResult.combinedOutput
      )}`
    );
    return { success: false, errors };
  }

  const iosSmokeResult = await runNativeSmoke(projectPath, "ios");
  if (!iosSmokeResult.success) {
    errors.push(
      `iOS smoke gate failed:\n${summarizeOutput(iosSmokeResult.combinedOutput)}`
    );
    return { success: false, errors };
  }

  return { success: true, errors };
};

export const createProject = async (
  options: CreateOptions
): Promise<CreateResult> => {
  const { description, lmStudioUrl, model, temperature, maxTokens, onProjectNameResolved } = options;

  // ── Step 1: Plan ──────────────────────────────────────
  broadcast({ type: "status", status: "planning" });

  const plan = await planApp({
    description,
    lmStudioUrl,
    model,
    temperature,
    maxTokens,
    onChunk: (chunk) => broadcast({ type: "plan_chunk", chunk }),
  });

  // Deduplicate project name
  let projectSlug = plan.name;
  let suffix = 0;
  while (fs.existsSync(getProjectPath(projectSlug))) {
    suffix++;
    projectSlug = `${plan.name}-${suffix}`;
  }

  onProjectNameResolved?.(projectSlug);

  broadcast({ type: "plan_complete", plan: { ...plan, name: projectSlug } });

  // ── Step 2: Scaffold ──────────────────────────────────
  broadcast({ type: "status", status: "scaffolding" });

  const projectPath = await createProjectFromCache(
    projectSlug,
    plan.displayName,
    plan.extraDependencies
  );

  broadcast({ type: "scaffold_complete", projectName: projectSlug });

  // ── Step 3: Generate files ────────────────────────────
  broadcast({ type: "status", status: "generating" });

  const files = await generateFiles({
    projectName: projectSlug,
    projectPath,
    plan,
    lmStudioUrl,
    model,
    temperature,
    maxTokens,
    onFileStart: (filepath, index, total) =>
      broadcast({
        type: "file_generating",
        filepath,
        progress: (index + 1) / total,
      }),
    onChunk: (chunk) => broadcast({ type: "code_chunk", chunk }),
    onFileComplete: (filepath) =>
      broadcast({ type: "file_complete", filepath }),
  });

  broadcast({ type: "generation_complete", filesCount: files.length });

  // ── Step 4: Git init ──────────────────────────────────
  gitInit(projectPath);

  // ── Step 5: Deterministic Validation Gates ────────────
  broadcast({ type: "status", status: "validating" });
  const gateResult = await runProjectQualityGates(
    projectPath,
    plan.navigation?.type
  );
  if (!gateResult.success) {
    const message = gateResult.errors.join("\n\n");
    broadcast({ type: "system_error", error: message });
    broadcast({ type: "status", status: "error" });
    return { projectName: projectSlug, port: 0, plan };
  }

  // ── Step 5b: Quick typecheck before Metro (catches signature mismatches early)
  try {
    const typecheckResult = await runTypecheck(projectPath);
    if (!typecheckResult.success) {
      broadcast({ type: "system_error", error: `TypeScript errors:\n${typecheckResult.output.slice(0, 1000)}` });
      // Don't abort — try to build anyway, Metro may fix some issues
    }
  } catch {
    // Typecheck failed to run — continue anyway
  }

  // ── Step 6: Build Verification Loop ───────────────────
  broadcast({ type: "status", status: "building" });

  let buildSuccess = false;
  let buildError: string | null = null;
  let autoFixAttempts = 0;
  const MAX_BUILD_AUTOFIX = 3;
  const BUILD_TIMEOUT = 60000; // 60s for first build (Metro is slow)

  // clearCache=true for initial project build
  const { port: expoPort } = await startExpo(projectSlug, projectPath, (event) => {
    broadcast({ type: "build_event", eventType: event.type, message: event.message, error: event.error });

    if (event.type === "build_success") {
      buildSuccess = true;
      buildError = null;
    }

    if (event.type === "build_error" && event.error) {
      buildError = event.error;
    }
  }, true); // clearCache for initial build

  // Wait for first build result (success or error)
  await waitForBuildOutcome(
    BUILD_TIMEOUT,
    () => buildSuccess || Boolean(buildError)
  );

  if (!buildSuccess && !buildError) {
    buildError = `Metro build timed out after ${BUILD_TIMEOUT}ms`;
  }

  // Auto-fix loop: if build failed, try to fix with LLM
  while (buildError && autoFixAttempts < MAX_BUILD_AUTOFIX) {
    autoFixAttempts++;
    const parsed = parseMetroError(buildError);
    if (!parsed) break;

    broadcast({ type: "autofix_start", file: parsed.file, error: parsed.raw });

    const fixResult = await autoFix({
      projectName: projectSlug,
      error: { type: parsed.type, file: parsed.file, line: parsed.line, raw: parsed.raw },
      lmStudioUrl,
      maxAttempts: 1,
      onAttempt: () =>
        broadcast({ type: "autofix_attempt", attempt: autoFixAttempts, maxAttempts: MAX_BUILD_AUTOFIX }),
      onFix: (block) =>
        broadcast({ type: "autofix_block", filepath: block.filepath }),
    });

    if (fixResult.success) {
      broadcast({ type: "autofix_success", attempts: autoFixAttempts });
    } else {
      broadcast({ type: "autofix_failed", attempts: autoFixAttempts, error: fixResult.lastError });
    }

    // Wait for Metro to recompile after fix
    buildSuccess = false;
    buildError = null;
    await waitForBuildOutcome(30000, () => buildSuccess || Boolean(buildError));

    if (!buildSuccess && !buildError) {
      broadcast({ type: "autofix_failed", attempts: autoFixAttempts, error: "Metro recompile timed out after fix" });
      break;
    }
  }

  if (buildSuccess) {
    const postFixGateResult = await runProjectQualityGates(
      projectPath,
      plan.navigation?.type
    );
    if (!postFixGateResult.success) {
      buildSuccess = false;
      buildError = postFixGateResult.errors.join("\n\n");
      broadcast({ type: "system_error", error: buildError });
    }
  }

  if (buildSuccess) {
    broadcast({ type: "status", status: "ready" });
  } else {
    broadcast({ type: "status", status: buildError ? "error" : "ready" });
  }

  if (expoPort) {
    // Wait for Metro to actually accept requests before announcing preview
    let metroReady = false;
    for (let i = 0; i < 40; i++) {
      try {
        const resp = await fetch(`http://127.0.0.1:${expoPort}`, { signal: AbortSignal.timeout(2000) });
        if (resp.ok) { metroReady = true; break; }
      } catch { /* not ready */ }
      await new Promise((r) => setTimeout(r, 750));
    }
    setPreviewPort(projectSlug, expoPort);
    if (metroReady) {
      broadcast({ type: "preview_ready", port: expoPort, projectName: projectSlug, proxyUrl: `/preview/${encodeURIComponent(projectSlug)}/` });
    }
  }

  // Git commit the successful state
  if (buildSuccess) {
    const hash = gitCommit(projectPath, "v1: initial generation (build verified)");
    if (hash) {
      broadcast({ type: "version_created", version: 1, hash, description: description.slice(0, 60) });
    }
  }

  return { projectName: projectSlug, port: expoPort, plan };
};

export const iterateProject = async (
  options: IterateOptions
): Promise<IterateResult> => {
  const { projectName, userRequest, chatHistory, lmStudioUrl, model, temperature, maxTokens } = options;
  const projectPath = getProjectPath(projectName);

  broadcast({ type: "status", status: "analyzing" });

  const result = await editProject({
    projectName,
    userRequest,
    chatHistory,
    lmStudioUrl,
    model,
    temperature,
    maxTokens,
    onThinking: (text) => broadcast({ type: "thinking", content: text }),
    onAnalysis: (action) =>
      broadcast({
        type: "analysis_complete",
        files: action.files,
        thinking: action.thinking,
      }),
    onBlock: (block) =>
      broadcast({ type: "block_applied", filepath: block.filepath, blockType: block.type }),
    onDiff: (filepath, before, after) =>
      broadcast({ type: "file_diff", filepath, before: before.slice(0, 5000), after: after.slice(0, 5000) }),
  });

  if (result.appliedBlocks > 0) {
    broadcast({ type: "status", status: "validating" });

    const gateResult = await runProjectQualityGates(projectPath);
    if (!gateResult.success) {
      broadcast({
        type: "iteration_complete",
        applied: result.appliedBlocks,
        failed: result.failedBlocks,
        errors: [...result.errors, ...gateResult.errors],
      });

      return {
        appliedBlocks: result.appliedBlocks,
        failedBlocks: result.failedBlocks,
        errors: [...result.errors, ...gateResult.errors],
      };
    }

    const versionNumber = getVersionNumber(projectPath);
    const commitHash = gitCommit(
      projectPath,
      `v${versionNumber}: ${userRequest.slice(0, 60)}`
    );

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

export const revertVersion = async (
  projectName: string,
  commitHash: string,
  _lmStudioUrl?: string
): Promise<void> => {
  const projectPath = getProjectPath(projectName);
  const port = getActivePort(projectName);

  broadcast({ type: "reloading_preview" });

  killExpo(projectName);

  if (!GIT_HASH_PATTERN.test(commitHash)) {
    broadcast({
      type: "system_error",
      error: `Invalid commit hash: ${commitHash}`,
    });
    return;
  }

  try {
    runGitCommand(projectPath, ["clean", "-fd"]);
    runGitCommand(projectPath, ["checkout", commitHash, "--", "."]);
  } catch (err) {
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
    setPreviewPort(projectName, port);
    broadcast({ type: "preview_ready", port, projectName, proxyUrl: `/preview/${encodeURIComponent(projectName)}/` });
  } else {
    broadcast({ type: "status", status: "ready" });
  }
};

// handleAutoFix removed — replaced by inline Build Verification Loop in createProject

const getVersionNumber = (projectPath: string): number => {
  try {
    const log = runGitCommand(projectPath, ["log", "--oneline"], {
      allowFailure: true,
    });
    return log ? log.split("\n").length + 1 : 1;
  } catch {
    return 1;
  }
};
