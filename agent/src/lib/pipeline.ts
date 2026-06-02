// Verifies generated projects with deterministic validation gates and scoped preview events before announcing success.
import fs from "fs";
import path from "path";
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
  npmInstall,
} from "../services/process-manager.js";
import { getProjectPath, readFile as readProjectFile, writeFile as writeProjectFile } from "../services/file-manager.js";
import { parseMetroError } from "../services/log-watcher.js";
import { planApp } from "./planner.js";
import { generateFiles, regenerateFileWithContracts, regenerateFileWithTypeErrors } from "./generator.js";
import { parseTypeErrors, groupDiagnosticsByFile, isFixableProjectFile } from "./typecheck.js";
import { editProject } from "./editor.js";
import { autoFix } from "./auto-fixer.js";
import type { AppPlan } from "../schemas/app-plan.schema.js";
import { validateGeneratedProject, validateFileContracts, autoHealImportContracts } from "./project-validator.js";
import { extractExportContracts, type ExportContract } from "./context-builder.js";
import { waitForMetroReady } from "./metro-ready.js";
import type { SupportedNavigationType } from "./generation-contract.js";
import { summarizeOutput, autoHealPlanDependencies, dedupeProjectSlug, summarizePlanForChat } from "./pipeline-helpers.js";
import { GIT_HASH_PATTERN, runGitCommand, gitCommit, gitInit, getVersionNumber } from "./git.js";
import { streamCompletion, type CompleteFn } from "../services/llm-proxy.js";
import { recordFix } from "./error-fix-store.js";

interface CreateOptions {
  description: string;
  lmStudioUrl?: string;
  model?: string;
  plannerModel?: string;
  /** Model for build autofix (Metro/type errors). Falls back to `model`, then auto. */
  editorModel?: string;
  embeddingModel?: string;
  /** Smart semantic RAG (default true). */
  semanticRagEnabled?: boolean;
  temperature?: number;
  maxTokens?: number;
  /** Nucleus sampling (0–1). When undefined, the model default applies. */
  topP?: number;
  requestId?: string;
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
  /** Model for the editor (analyze + edit). Falls back to `model`, then auto. */
  editorModel?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  requestId?: string;
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

/**
 * The side-effecting boundary createProject depends on. Defaults wire the real
 * implementations (createDefaultContext); tests pass fakes for deterministic,
 * mock-free coverage of the orchestration. Members are named like the imports
 * they replace so call sites stay unchanged after destructuring `ctx`.
 */
export interface PipelineContext {
  complete: CompleteFn;
  createProjectFromCache: typeof createProjectFromCache;
  startExpo: typeof startExpo;
  startExpoClearCache: typeof startExpoClearCache;
  killExpo: typeof killExpo;
  getActivePort: typeof getActivePort;
  runTypecheck: typeof runTypecheck;
  runWebExport: typeof runWebExport;
  runNativeSmoke: typeof runNativeSmoke;
  npmInstall: typeof npmInstall;
  runGitCommand: typeof runGitCommand;
  broadcast: typeof broadcast;
  setPreviewPort: typeof setPreviewPort;
  fetch: typeof fetch;
}

export const createDefaultContext = (): PipelineContext => ({
  complete: streamCompletion,
  createProjectFromCache,
  startExpo,
  startExpoClearCache,
  killExpo,
  getActivePort,
  runTypecheck,
  runWebExport,
  runNativeSmoke,
  npmInstall,
  runGitCommand,
  broadcast,
  setPreviewPort,
  fetch: globalThis.fetch.bind(globalThis),
});

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
  navigationType?: SupportedNavigationType,
  ctx: PipelineContext = createDefaultContext()
): Promise<GateResult> => {
  const { npmInstall, runTypecheck, runWebExport, runNativeSmoke } = ctx;
  const errors: string[] = [];
  const staticIssues = validateGeneratedProject(
    projectPath,
    navigationType ?? undefined
  );

  if (staticIssues.length > 0) {
    // Self-healing: auto-install missing npm packages before failing
    const missingPkgIssues = staticIssues.filter((i) => i.code === "missing_package_dependency");
    const otherIssues = staticIssues.filter((i) => i.code !== "missing_package_dependency");

    if (missingPkgIssues.length > 0) {
      const missingDeps = [...new Set(
        missingPkgIssues
          .map((i) => {
            const match = i.message.match(/requires missing dependency "([^"]+)"/);
            return match?.[1];
          })
          .filter((dep): dep is string => !!dep && !dep.startsWith("."))
      )];

      if (missingDeps.length > 0) {
        console.log(`[Pipeline] Auto-installing missing deps: ${missingDeps.join(", ")}`);
        try {
          await npmInstall(projectPath, missingDeps);

          // Re-validate after install
          const revalidated = validateGeneratedProject(projectPath, navigationType ?? undefined);
          if (revalidated.length === 0) {
            // All issues resolved — continue to typecheck
            console.log("[Pipeline] Auto-install resolved all static issues");
          } else {
            errors.push(
              `Static validation failed: ${revalidated
                .map((issue) => `${issue.filePath ?? "project"}: ${issue.message}`)
                .join("; ")}`
            );
            return { success: false, errors };
          }
        } catch (installErr) {
          console.warn(`[Pipeline] Auto-install failed: ${installErr instanceof Error ? installErr.message : String(installErr)}`);
          errors.push(
            `Static validation failed: ${staticIssues
              .map((issue) => `${issue.filePath ?? "project"}: ${issue.message}`)
              .join("; ")}`
          );
          return { success: false, errors };
        }
      }
    }

    if (otherIssues.length > 0) {
      errors.push(
        `Static validation failed: ${otherIssues
          .map((issue) => `${issue.filePath ?? "project"}: ${issue.message}`)
          .join("; ")}`
      );
      return { success: false, errors };
    }
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

  // iOS prebuild requires macOS — skip on other platforms
  if (process.platform === "darwin") {
    const iosSmokeResult = await runNativeSmoke(projectPath, "ios");
    if (!iosSmokeResult.success) {
      errors.push(
        `iOS smoke gate failed:\n${summarizeOutput(iosSmokeResult.combinedOutput)}`
      );
      return { success: false, errors };
    }
  }

  return { success: true, errors };
};

export const createProject = async (
  options: CreateOptions,
  ctx: PipelineContext = createDefaultContext()
): Promise<CreateResult> => {
  try {
    return await _createProjectInner(options, ctx);
  } catch (error) {
    const scope = options.requestId ? { requestId: options.requestId } : {};
    const rawMessage = error instanceof Error ? error.message : String(error);
    const isLlmDown =
      rawMessage.includes("LLM_SERVER_DOWN") ||
      rawMessage.includes("LLM_NETWORK_ERROR");
    // Surface the actual failure reason to the chat before flipping status,
    // otherwise the client only sees a bare "error" with no explanation.
    ctx.broadcast({
      type: "system_error",
      error: isLlmDown ? `AI server disconnected: ${rawMessage}` : rawMessage,
      ...scope,
    });
    ctx.broadcast({
      type: "status",
      status: "error",
      ...scope,
    });
    throw error;
  }
};

const _createProjectInner = async (
  options: CreateOptions,
  ctx: PipelineContext
): Promise<CreateResult> => {
  const {
    description,
    lmStudioUrl,
    model,
    plannerModel,
    editorModel,
    embeddingModel,
    semanticRagEnabled = true,
    temperature,
    maxTokens,
    topP,
    requestId,
    onProjectNameResolved,
  } = options;
  const {
    complete,
    createProjectFromCache,
    startExpo,
    runTypecheck,
    runGitCommand,
    broadcast,
    setPreviewPort,
    fetch,
  } = ctx;
  let projectSlug: string | null = null;
  const emitOperation = (message: Record<string, unknown>): void => {
    broadcast({
      ...message,
      ...(requestId ? { requestId } : {}),
      ...(projectSlug ? { projectName: projectSlug } : {}),
    });
  };
  const emitBuildScoped = (
    buildId: string,
    message: Record<string, unknown>
  ): void => {
    emitOperation({ ...message, buildId });
  };

  // ── Step 1: Plan ──────────────────────────────────────
  emitOperation({ type: "status", status: "planning" });
  emitOperation({
    type: "build_event",
    eventType: "moe_swap",
    message: `🧠 [MoE] Loading Planner Model (${plannerModel || model || "Auto"})...`,
  });

  const plan = await planApp({
    description,
    lmStudioUrl,
    model: plannerModel || model,
    temperature,
    maxTokens,
    topP,
    complete,
    onChunk: (chunk) => emitOperation({ type: "plan_chunk", chunk }),
  });

  // Auto-heal plan: add missing dependency files that are referenced but not in files[]
  autoHealPlanDependencies(plan);

  // Deduplicate project name
  projectSlug = dedupeProjectSlug(plan.name, (slug) => fs.existsSync(getProjectPath(slug)));

  onProjectNameResolved?.(projectSlug);

  emitOperation({ type: "plan_complete", plan: { ...plan, name: projectSlug } });

  // Humanize: surface the planner's intent as a reasoning bubble in chat.
  emitOperation({ type: "thinking", content: summarizePlanForChat(plan) });

  // ── Step 2: Scaffold ──────────────────────────────────
  emitOperation({ type: "status", status: "scaffolding" });

  const projectPath = await createProjectFromCache(
    projectSlug,
    plan.displayName,
    plan.extraDependencies
  );

  emitOperation({ type: "scaffold_complete", projectName: projectSlug });

  // ── Step 3: Generate files ────────────────────────────
  emitOperation({ type: "status", status: "generating" });
  emitOperation({
    type: "build_event",
    eventType: "moe_swap",
    message: `💻 [MoE] Swapping to Generation Model (${model || "Auto"})...`,
  });

  const files = await generateFiles({
    projectName: projectSlug,
    projectPath,
    plan,
    lmStudioUrl,
    model,
    embeddingModel,
    semanticRagEnabled,
    temperature,
    maxTokens,
    topP,
    complete,
    onFileStart: (filepath, index, total) =>
      emitOperation({
        type: "file_generating",
        filepath,
        progress: (index + 1) / total,
      }),
    onChunk: (chunk) => emitOperation({ type: "code_chunk", chunk }),
    onThinking: (filepath, reasoning) =>
      emitOperation({ type: "thinking", content: `\`${filepath}\`\n${reasoning}` }),
    onFileComplete: (filepath) =>
      emitOperation({ type: "file_complete", filepath }),
  });

  emitOperation({ type: "generation_complete", filesCount: files.length });

  // ── Step 3b: Contract Validation + Auto-Fix ────────────
  {
    const MAX_CONTRACT_RETRIES = 2;

    // Build contracts from all generated files
    const allContracts: Record<string, ExportContract[]> = {};
    for (const fp of files) {
      const contracts = extractExportContracts(path.join(projectPath, fp));
      if (contracts) allContracts[fp] = contracts;
    }

    // Validate + auto-fix loop per file
    for (const fp of files) {
      let retries = 0;

      while (retries <= MAX_CONTRACT_RETRIES) {
        let content = readProjectFile(projectSlug, fp);
        if (!content) break;

        // Auto-heal import mismatches with regex before LLM retry
        const healed = autoHealImportContracts(content, allContracts);
        if (healed !== content) {
          writeProjectFile(projectSlug, fp, healed);
          content = healed;
        }

        const violations = validateFileContracts(content, fp, allContracts, projectPath);
        if (violations.length === 0) break;

        if (retries === MAX_CONTRACT_RETRIES) {
          const summary = violations.map((v) => v.message).join("; ");
          emitOperation({
            type: "system_error",
            error: `Contract violations in ${fp} after ${MAX_CONTRACT_RETRIES} retries: ${summary}`,
          });
          break;
        }

        retries++;
        emitOperation({
          type: "autofix_start",
          file: fp,
          error: `Contract violations: ${violations.length}`,
        });

        const fixSuccess = await regenerateFileWithContracts(
          projectSlug, projectPath, fp, violations, allContracts,
          { lmStudioUrl, model, maxTokens, complete },
        );

        if (!fixSuccess) {
          console.warn(`[Pipeline] Contract auto-fix failed for ${fp}, proceeding with original`);
          break;
        }

        // Re-extract contracts after fix
        const updatedContracts = extractExportContracts(path.join(projectPath, fp));
        if (updatedContracts) allContracts[fp] = updatedContracts;
      }
    }
  }

  // ── Step 3c: Compiler-in-the-loop Type-Fix ────────────
  // Run the real typechecker, feed structured per-file errors back to the model,
  // and iterate until the project compiles or we stop making progress. This is the
  // fast inner loop that runs BEFORE the heavy web-export / native gates.
  {
    const MAX_TYPE_FIX_ROUNDS = 3;
    emitOperation({ type: "status", status: "validating" });

    for (let round = 1; round <= MAX_TYPE_FIX_ROUNDS; round++) {
      const typecheck = await runTypecheck(projectPath);
      if (typecheck.success) break;

      const diagnostics = parseTypeErrors(typecheck.combinedOutput).filter((d) =>
        isFixableProjectFile(d.filePath)
      );
      if (diagnostics.length === 0) break;

      // Rebuild contracts so the fixer sees the current export shapes.
      const allContracts: Record<string, ExportContract[]> = {};
      for (const fp of files) {
        const contracts = extractExportContracts(path.join(projectPath, fp));
        if (contracts) allContracts[fp] = contracts;
      }

      const byFile = groupDiagnosticsByFile(diagnostics);
      let fixedAny = false;

      for (const [fp, fileDiagnostics] of byFile) {
        emitOperation({
          type: "build_event",
          eventType: "self_healing",
          message: `🔧 Type-fix ${round}/${MAX_TYPE_FIX_ROUNDS}: ${fp} (${fileDiagnostics
            .map((d) => d.code)
            .join(", ")})`,
        });
        emitOperation({
          type: "autofix_start",
          file: fp,
          error: `${fileDiagnostics.length} type error(s)`,
        });

        try {
          const fixed = await regenerateFileWithTypeErrors(
            projectSlug,
            projectPath,
            fp,
            fileDiagnostics,
            allContracts,
            { lmStudioUrl, model, maxTokens, complete }
          );
          if (fixed) fixedAny = true;
        } catch (err) {
          console.warn(
            `[Pipeline] Type-fix failed for ${fp}: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }

      if (!fixedAny) break; // no file changed → further rounds won't help
    }
  }

  // ── Step 4: Git init ──────────────────────────────────
  gitInit(projectPath, runGitCommand);

  // ── Step 5: Deterministic Validation Gates ────────────
  emitOperation({ type: "status", status: "validating" });
  const gateResult = await runProjectQualityGates(
    projectPath,
    plan.navigation?.type,
    ctx
  );
  if (!gateResult.success) {
    const message = gateResult.errors.join("\n\n");
    emitOperation({ type: "system_error", error: message });
    emitOperation({ type: "status", status: "error" });
    return { projectName: projectSlug, port: 0, plan };
  }

  // ── Step 5b: Quick typecheck before Metro (catches signature mismatches early)
  try {
    const typecheckResult = await runTypecheck(projectPath);
    if (!typecheckResult.success) {
      emitOperation({
        type: "system_error",
        error: `TypeScript errors:\n${typecheckResult.combinedOutput.slice(0, 1000)}`,
      });
      // Don't abort — try to build anyway, Metro may fix some issues
    }
  } catch {
    // Typecheck failed to run — continue anyway
  }

  // ── Step 6: Build Verification Loop ───────────────────
  const buildId = crypto.randomUUID();
  emitOperation({
    type: "status",
    status: "building",
    previewStatus: "starting",
    buildId,
  });
  emitBuildScoped(buildId, {
    type: "preview_status",
    previewStatus: "starting",
  });

  let buildSuccess = false;
  let buildError: string | null = null;
  let autoFixAttempts = 0;
  const MAX_BUILD_AUTOFIX = 3;
  const BUILD_TIMEOUT = 60000; // 60s for first build (Metro is slow)

  // clearCache=true for initial project build
  const { port: expoPort } = await startExpo(projectSlug, projectPath, (event) => {
    emitBuildScoped(buildId, {
      type: "build_event",
      eventType: event.type,
      message: event.message,
      error: event.error,
      previewStatus: "starting",
    });

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

    emitBuildScoped(buildId, {
      type: "autofix_start",
      file: parsed.file,
      error: parsed.raw,
    });

    let lastFixedBlock: { filepath: string; replace: string } | null = null;
    const fixResult = await autoFix({
      projectName: projectSlug,
      error: { type: parsed.type, file: parsed.file, line: parsed.line, raw: parsed.raw },
      lmStudioUrl,
      model: editorModel || model,
      complete,
      maxAttempts: 1,
      onAttempt: () =>
        emitBuildScoped(buildId, {
          type: "autofix_attempt",
          attempt: autoFixAttempts,
          maxAttempts: MAX_BUILD_AUTOFIX,
        }),
      onFix: (block) => {
        lastFixedBlock = { filepath: block.filepath, replace: block.replace ?? "" };
        emitBuildScoped(buildId, {
          type: "autofix_block",
          filepath: block.filepath,
        });
      },
    });

    if (fixResult.success) {
      if (lastFixedBlock) {
        const fixedBlock: { filepath: string; replace: string } = lastFixedBlock;
        recordFix({
          errorSignature: parsed.raw,
          file: fixedBlock.filepath,
          fixSummary: fixedBlock.replace.slice(0, 600),
        });
      }
      emitBuildScoped(buildId, {
        type: "autofix_success",
        attempts: autoFixAttempts,
      });
    } else {
      emitBuildScoped(buildId, {
        type: "autofix_failed",
        attempts: autoFixAttempts,
        error: fixResult.lastError,
      });
    }

    // Wait for Metro to recompile after fix
    buildSuccess = false;
    buildError = null;
    await waitForBuildOutcome(30000, () => buildSuccess || Boolean(buildError));

    if (!buildSuccess && !buildError) {
      emitBuildScoped(buildId, {
        type: "autofix_failed",
        attempts: autoFixAttempts,
        error: "Metro recompile timed out after fix",
      });
      break;
    }
  }

  if (buildSuccess) {
    const postFixGateResult = await runProjectQualityGates(
      projectPath,
      plan.navigation?.type,
      ctx
    );
    if (!postFixGateResult.success) {
      buildSuccess = false;
      buildError = postFixGateResult.errors.join("\n\n");
      emitBuildScoped(buildId, { type: "system_error", error: buildError });
    }
  }

  if (buildSuccess && expoPort) {
    // Wait for Metro to serve AND compile the bundle before announcing preview,
    // so the iframe renders immediately instead of showing a blank page.
    const metroReady = await waitForMetroReady(expoPort, 60, fetch);
    if (metroReady) {
      setPreviewPort(projectSlug, expoPort);
      emitBuildScoped(buildId, {
        type: "preview_ready",
        port: expoPort,
        proxyUrl: `/preview/${encodeURIComponent(projectSlug)}/`,
      });
      emitBuildScoped(buildId, {
        type: "preview_status",
        previewStatus: "ready",
      });
      emitOperation({
        type: "status",
        status: "ready",
        previewStatus: "ready",
        buildId,
      });
    } else {
      buildSuccess = false;
      buildError = `Metro not ready on port ${expoPort}`;
      console.warn(`[Pipeline] Metro not ready on port ${expoPort} — preview not announced`);
    }
  }

  if (!buildSuccess || buildError) {
    const previewError = buildError ?? "Preview failed to start";
    emitBuildScoped(buildId, {
      type: "preview_status",
      previewStatus: "error",
      error: previewError,
    });
    emitOperation({
      type: "status",
      status: "error",
      previewStatus: "error",
      buildId,
    });
  }

  // Git commit the successful state
  if (buildSuccess) {
    const hash = gitCommit(projectPath, "v1: initial generation (build verified)", runGitCommand);
    if (hash) {
      emitOperation({
        type: "version_created",
        version: 1,
        hash,
        description: description.slice(0, 60),
      });
    }
  }

  return { projectName: projectSlug, port: expoPort, plan };
};

export const iterateProject = async (
  options: IterateOptions
): Promise<IterateResult> => {
  try {
    return await _iterateProjectInner(options);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const scopedMessage = {
      ...(options.requestId ? { requestId: options.requestId } : {}),
      projectName: options.projectName,
    };
    if (msg.includes("LLM_SERVER_DOWN") || msg.includes("LLM_NETWORK_ERROR")) {
      broadcast({
        type: "system_error",
        error: `AI server disconnected: ${msg}`,
        ...scopedMessage,
      });
    } else {
      broadcast({ type: "system_error", error: msg, ...scopedMessage });
    }
    broadcast({ type: "status", status: "error", ...scopedMessage });
    return { appliedBlocks: 0, failedBlocks: 0, errors: [msg] };
  }
};

const _iterateProjectInner = async (
  options: IterateOptions
): Promise<IterateResult> => {
  const { projectName, userRequest, chatHistory, lmStudioUrl, model, editorModel, temperature, maxTokens, topP, requestId } = options;
  const projectPath = getProjectPath(projectName);
  const emitProject = (message: Record<string, unknown>): void => {
    broadcast({
      ...message,
      projectName,
      ...(requestId ? { requestId } : {}),
    });
  };

  emitProject({ type: "status", status: "analyzing" });

  const result = await editProject({
    projectName,
    userRequest,
    chatHistory,
    lmStudioUrl,
    model: editorModel || model,
    temperature,
    maxTokens,
    topP,
    onThinking: (text) => emitProject({ type: "thinking", content: text }),
    onAnalysis: (action) =>
      emitProject({
        type: "analysis_complete",
        files: action.files,
        thinking: action.thinking,
      }),
    onBlock: (block) =>
      emitProject({ type: "block_applied", filepath: block.filepath, blockType: block.type }),
    onDiff: (filepath, before, after) =>
      emitProject({
        type: "file_diff",
        filepath,
        before: before.slice(0, 5000),
        after: after.slice(0, 5000),
      }),
  });

  if (result.appliedBlocks > 0) {
    emitProject({ type: "status", status: "validating" });

    const gateResult = await runProjectQualityGates(projectPath);
    if (!gateResult.success) {
      const combinedErrors = [...result.errors, ...gateResult.errors];
      const failedCount = Math.max(result.failedBlocks, gateResult.errors.length, 1);
      emitProject({
        type: "iteration_complete",
        applied: result.appliedBlocks,
        failed: failedCount,
        errors: combinedErrors,
      });
      emitProject({ type: "status", status: "error" });

      return {
        appliedBlocks: result.appliedBlocks,
        failedBlocks: failedCount,
        errors: combinedErrors,
      };
    }

    const versionNumber = getVersionNumber(projectPath);
    const commitHash = gitCommit(
      projectPath,
      `v${versionNumber}: ${userRequest.slice(0, 60)}`
    );

    if (commitHash) {
      emitProject({
        type: "version_created",
        version: versionNumber,
        hash: commitHash,
        description: userRequest,
      });
    }
  }

  emitProject({
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
  _lmStudioUrl?: string,
  requestId?: string
): Promise<void> => {
  const projectPath = getProjectPath(projectName);
  const port = getActivePort(projectName);
  const emitProject = (message: Record<string, unknown>): void => {
    broadcast({
      ...message,
      projectName,
      ...(requestId ? { requestId } : {}),
    });
  };

  emitProject({ type: "reloading_preview" });

  killExpo(projectName);

  if (!GIT_HASH_PATTERN.test(commitHash)) {
    emitProject({
      type: "system_error",
      error: `Invalid commit hash: ${commitHash}`,
    });
    return;
  }

  try {
    runGitCommand(projectPath, ["clean", "-fd"]);
    runGitCommand(projectPath, ["checkout", commitHash, "--", "."]);
  } catch (err) {
    emitProject({
      type: "system_error",
      error: `Git revert failed: ${err instanceof Error ? err.message : "unknown"}`,
    });
    return;
  }

  if (port) {
    const buildId = crypto.randomUUID();
    emitProject({
      type: "preview_status",
      previewStatus: "starting",
      buildId,
    });
    await startExpoClearCache(projectName, projectPath, port, (event) => {
      emitProject({
        type: "build_event",
        buildId,
        eventType: event.type,
        message: event.message,
        error: event.error,
        previewStatus: "starting",
      });
    });
    setPreviewPort(projectName, port);
    emitProject({
      type: "preview_ready",
      buildId,
      port,
      proxyUrl: `/preview/${encodeURIComponent(projectName)}/`,
    });
    emitProject({
      type: "preview_status",
      previewStatus: "ready",
      buildId,
    });
    emitProject({
      type: "status",
      status: "ready",
      previewStatus: "ready",
      buildId,
    });
  } else {
    emitProject({ type: "preview_status", previewStatus: "stopped", buildId: crypto.randomUUID() });
    emitProject({ type: "status", status: "ready" });
  }
};

// handleAutoFix removed — replaced by inline Build Verification Loop in createProject
// git helpers (runGitCommand/gitCommit/gitInit/getVersionNumber) live in ./git.ts
