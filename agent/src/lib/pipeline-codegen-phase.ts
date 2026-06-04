// Codegen + validate + Metro preview — shared by create and resume.
import crypto from "crypto";
import path from "path";
import type { AppPlan } from "../schemas/app-plan.schema.js";
import type { CompleteFn } from "../services/llm-proxy.js";
import { readFile as readProjectFile, writeFile as writeProjectFile } from "../services/file-manager.js";
import { parseMetroError } from "../services/log-watcher.js";
import { generateFiles, regenerateFileWithContracts, regenerateFileWithTypeErrors } from "./generator.js";
import { parseTypeErrors, groupDiagnosticsByFile, isFixableProjectFile } from "./typecheck.js";
import { validateFileContracts, autoHealImportContracts } from "./project-validator.js";
import { extractExportContracts, type ExportContract } from "./context-builder.js";
import { triggerMetroBuild, waitForMetroReady } from "./metro-ready.js";
import { formatModelRoleLabel } from "./model-roles.js";
import { autoFix } from "./auto-fixer.js";
import { applyAutofixWithGate, countTypeErrors } from "./pipeline-typecheck-gate.js";
import { recordFix } from "./error-fix-store.js";
import { recordExemplar } from "./exemplar-store.js";
import { buildResumeStatusMessage } from "./pipeline-resume-status.js";
import { gitCommit, gitInit } from "./git.js";
import type { PipelineContext } from "./pipeline-types.js";
import { waitForBuildOutcome, runProjectQualityGates } from "./pipeline-gates.js";
import { runPolishStage } from "./pipeline-polish.js";
import { saveGenerationState } from "./generation-state.js";

export interface CodegenShipResult {
  projectName: string;
  port: number;
  plan: AppPlan;
}

export interface RunCodegenShipParams {
  projectSlug: string;
  projectPath: string;
  plan: AppPlan;
  description: string;
  generationModel: string | undefined;
  fixModel: string | undefined;
  lmStudioUrl?: string;
  embeddingModel?: string;
  semanticRagEnabled?: boolean;
  autoPolishEnabled?: boolean;
  autoPolishMaxPasses?: number;
  polishModel?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  complete: CompleteFn;
  ctx: PipelineContext;
  emitOperation: (message: Record<string, unknown>) => void;
  emitBuildScoped: (buildId: string, message: Record<string, unknown>) => void;
  skipExistingFiles?: boolean;
  gitCommitMessage?: string;
}

export const runCodegenAndShip = async (
  params: RunCodegenShipParams,
): Promise<CodegenShipResult> => {
  const {
    projectSlug,
    projectPath,
    plan,
    description,
    generationModel,
    fixModel,
    lmStudioUrl,
    embeddingModel,
    semanticRagEnabled,
    autoPolishEnabled,
    autoPolishMaxPasses,
    polishModel,
    model,
    temperature,
    maxTokens,
    topP,
    complete,
    ctx,
    emitOperation,
    emitBuildScoped,
    skipExistingFiles = false,
    gitCommitMessage = "v1: initial generation (build verified)",
  } = params;
  // startExpo/runTypecheck/killExpo MUST come from ctx so the mock-free
  // integration test stays hermetic (the refactor had imported them directly,
  // which ran real subprocesses and broke DI).
  const { runGitCommand, setPreviewPort, fetch, startExpo, runTypecheck, killExpo } = ctx;

  // ── Step 3: Generate files ────────────────────────────
  emitOperation({ type: "status", status: "generating" });
  emitOperation({
    type: "build_event",
    eventType: "moe_swap",
    message: formatModelRoleLabel("generation", generationModel),
  });
  
  const files = await generateFiles({
    projectName: projectSlug,
    projectPath,
    plan,
    lmStudioUrl,
    model: generationModel,
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
    skipExistingFiles,
  });
  
  emitOperation({ type: "generation_complete", filesCount: files.length });
  saveGenerationState(projectSlug, plan, "codegen");
  emitOperation(buildResumeStatusMessage(projectSlug));

  // Repair signals for the learned-exemplar capture gate (path B). We only learn
  // exemplars from a generation that built CLEAN with ZERO repair — any contract-fix,
  // type-fix, or Metro autofix invocation flips one of these flags and disqualifies
  // the whole project from being used as teaching material (quality-drift guard).
  let didContractFix = false;
  let didTypeFix = false;

  // ── Step 3b: Contract Validation + Auto-Fix ────────────
  {
    emitOperation({ type: "status", status: "analyzing" });
    emitOperation({
      type: "build_event",
      eventType: "moe_swap",
      message: formatModelRoleLabel("fix", fixModel),
    });
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
        didContractFix = true; // repair ran → disqualify from exemplar capture
        emitOperation({
          type: "autofix_start",
          file: fp,
          error: `Contract violations: ${violations.length}`,
        });
  
        const fixSuccess = await regenerateFileWithContracts(
          projectSlug, projectPath, fp, violations, allContracts,
          { lmStudioUrl, model: fixModel, maxTokens, complete },
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
    emitOperation({
      type: "build_event",
      eventType: "moe_swap",
      message: `${formatModelRoleLabel("fix", fixModel)} — type-check loop`,
    });
  
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
        didTypeFix = true; // type repair ran → disqualify from exemplar capture
  
        try {
          const fixed = await regenerateFileWithTypeErrors(
            projectSlug,
            projectPath,
            fp,
            fileDiagnostics,
            allContracts,
            { lmStudioUrl, model: fixModel, maxTokens, complete }
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
    saveGenerationState(projectSlug, plan, "codegen");
    emitOperation({ type: "system_error", error: message });
    emitOperation({ type: "status", status: "error" });
    emitOperation(buildResumeStatusMessage(projectSlug));
    return { projectName: projectSlug, port: 0, plan };
  }
  
  // NOTE: A pre-Metro typecheck used to run here, but Step 5's quality gate already
  // runs `tsc --noEmit` as a HARD blocking gate (returns port:0 on failure), so by
  // this point typecheck has provably passed on these unchanged files. Re-running it
  // was dead work that added a full `tsc` (~tens of seconds) to every successful
  // generation and only emitted a warning it could never reach. Removed for speed.
  
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
  // First web bundle with heavy deps (Tamagui + chart-kit + svg + reanimated) on a
  // cold Metro routinely needs 60-120s. A too-short timeout produced a fake
  // "Metro build timed out" error that autofix could not act on.
  const BUILD_TIMEOUT = 120000;
  
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
  
  // Expo web compiles lazily — no page request, no bundle, no "Bundled" log, so
  // the wait below would always time out. Fire the first request to kick off
  // compilation concurrently with the outcome wait.
  void triggerMetroBuild(expoPort).catch(() => {
    // Best-effort: the build-outcome wait still observes the real result.
  });
  
  // Wait for first build result (success or error)
  await waitForBuildOutcome(
    BUILD_TIMEOUT,
    () => buildSuccess || Boolean(buildError)
  );
  
  if (!buildSuccess && !buildError) {
    buildError = `Metro build timed out after ${BUILD_TIMEOUT}ms`;
  }
  
  // Auto-fix loop: if build failed, try to fix with LLM
  let metroFixMoeAnnounced = false;
  while (buildError && autoFixAttempts < MAX_BUILD_AUTOFIX) {
    autoFixAttempts++;
    if (!metroFixMoeAnnounced) {
      emitBuildScoped(buildId, {
        type: "build_event",
        eventType: "moe_swap",
        message: `${formatModelRoleLabel("fix", fixModel)} — Metro autofix`,
      });
      metroFixMoeAnnounced = true;
    }
    const parsed = parseMetroError(buildError);
    if (!parsed) break;
  
    // Non-actionable failures (Metro timeout, crashes with no source location) parse
    // to file "unknown". Running autofix on them just emits a confusing "Could not fix"
    // with no real attempt, so stop the loop and let the honest build error surface.
    if (!parsed.file || parsed.file === "unknown") {
      break;
    }
  
    emitBuildScoped(buildId, {
      type: "autofix_start",
      file: parsed.file,
      error: parsed.raw,
    });
  
    // Anti-regression gate: take a typecheck baseline BEFORE the fix so we can
    // tell whether the applied fix introduced NEW type errors. Bounded/safe — if
    // runTypecheck is unavailable or throws, the gate falls back to keeping the
    // fix (today's behavior) and never breaks the loop.
    let baselineErrors = 0;
    try {
      const baseline = await runTypecheck(projectPath);
      baselineErrors = baseline.success ? 0 : countTypeErrors(baseline.combinedOutput);
    } catch {
      baselineErrors = 0;
    }

    const gated = await applyAutofixWithGate(
      {
        autoFix,
        runTypecheck,
        readFile: (fp) => readProjectFile(projectSlug, fp),
        writeFile: (fp, content) => writeProjectFile(projectSlug, fp, content),
        emit: (message) => emitBuildScoped(buildId, message),
      },
      {
        projectName: projectSlug,
        projectPath,
        error: { type: parsed.type, file: parsed.file, line: parsed.line, raw: parsed.raw },
        lmStudioUrl,
        model: fixModel,
        complete,
        baselineErrors,
        onAttempt: () =>
          emitBuildScoped(buildId, {
            type: "autofix_attempt",
            attempt: autoFixAttempts,
            maxAttempts: MAX_BUILD_AUTOFIX,
          }),
        onFix: (block) =>
          emitBuildScoped(buildId, {
            type: "autofix_block",
            filepath: block.filepath,
          }),
      },
    );
    const fixResult = gated.fixResult;
  
    if (gated.applied) {
      if (gated.lastAppliedBlock) {
        const fixedBlock = gated.lastAppliedBlock;
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
        // A reverted fix regressed the typecheck; surface that as the reason.
        error: gated.reverted
          ? "Fix reverted: introduced new type errors"
          : fixResult.lastError,
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
      saveGenerationState(projectSlug, plan, "shipped");
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
    killExpo(projectSlug);
  }
  
  // Git commit the successful state
  if (buildSuccess) {
    const hash = gitCommit(projectPath, gitCommitMessage, runGitCommand);
    if (hash) {
      emitOperation({
        type: "version_created",
        version: 1,
        hash,
        description: description.slice(0, 60),
      });
    }
  }

  // ── Learned-exemplar capture (win-rate lever #4, path B) ──
  // STRICT GATE: learn exemplars ONLY from a CLEAN generation — the project reached
  // build success / ready preview AND required ZERO repair (no Metro autofix, no
  // contract-fix, no type-fix). When all three are true, every file is known
  // first-pass-correct, so a few representative ones (one screen, one store, one
  // component) become teaching material for future generations. Captured BEFORE the
  // opt-in auto-polish stage so we learn the model's first-pass output, never polished
  // edits. Fully wrapped in try/catch + best-effort store: capture can NEVER affect the
  // already-verified generation result. When in doubt (any repair flag set, or capture
  // throws), we DON'T learn — the prompt simply falls back to the curated golden one.
  const cleanGeneration =
    buildSuccess && autoFixAttempts === 0 && !didContractFix && !didTypeFix;
  if (cleanGeneration) {
    try {
      const seenTypes = new Set<string>();
      for (const fileSpec of plan.files) {
        const type = fileSpec.type.toLowerCase().trim();
        // One representative file per type (screen/store/component) keeps the store
        // diverse and bounded; the per-type cap in recordExemplar does the rest.
        if (!["screen", "store", "component"].includes(type)) continue;
        if (seenTypes.has(type)) continue;
        const code = readProjectFile(projectSlug, fileSpec.path);
        if (!code) continue;
        recordExemplar({
          type: fileSpec.type,
          description: fileSpec.description,
          code,
        });
        seenTypes.add(type);
      }
    } catch (err) {
      console.warn(
        `[Pipeline] Exemplar capture failed (ignored): ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // ── Step 7 (OPT-IN): Auto-polish design loop ──────────
  // Runs ONLY when explicitly enabled AND the project built successfully. Each
  // accepted change is gated by a typecheck (anti-regression). Fully wrapped so it
  // can never break an already-verified generation; the running Metro web bundle
  // hot-reloads on file change, so no explicit preview refresh is required.
  if (autoPolishEnabled && buildSuccess) {
    try {
      await runPolishStage(
        projectSlug,
        projectPath,
        files,
        autoPolishMaxPasses ?? 2,
        { lmStudioUrl, model: polishModel || model, maxTokens },
        ctx,
        emitOperation
      );
    } catch (err) {
      console.warn(
        `[Pipeline] Auto-polish stage failed (ignored): ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
  
  return { projectName: projectSlug, port: expoPort, plan };
};
