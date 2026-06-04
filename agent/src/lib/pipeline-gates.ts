// Quality gates and build-outcome polling — shared by codegen-ship and iteration.
import type { SupportedNavigationType } from "./generation-contract.js";
import { summarizeOutput } from "./pipeline-helpers.js";
import {
  createDefaultContext,
  type GateResult,
  type PipelineContext,
} from "./pipeline-types.js";
import { validateGeneratedProject } from "./project-validator.js";

export const waitForBuildOutcome = async (
  timeoutMs: number,
  hasOutcome: () => boolean,
): Promise<void> => {
  await new Promise<void>((resolve) => {
    let settled = false;

    const finish = (
      intervalId: ReturnType<typeof setInterval>,
      timeoutId: ReturnType<typeof setTimeout>,
    ): void => {
      if (settled) return;
      settled = true;
      clearInterval(intervalId);
      clearTimeout(timeoutId);
      resolve();
    };

    const intervalId = setInterval(() => {
      if (hasOutcome()) finish(intervalId, timeoutId);
    }, 500);
    const timeoutId = setTimeout(() => finish(intervalId, timeoutId), timeoutMs);
    if (hasOutcome()) finish(intervalId, timeoutId);
  });
};

export const runProjectQualityGates = async (
  projectPath: string,
  navigationType?: SupportedNavigationType,
  ctx: PipelineContext = createDefaultContext(),
): Promise<GateResult> => {
  const { npmInstall, runTypecheck, runWebExport, runNativeSmoke } = ctx;
  const errors: string[] = [];
  const staticIssues = validateGeneratedProject(projectPath, navigationType ?? undefined);

  if (staticIssues.length > 0) {
    const missingPkgIssues = staticIssues.filter((i) => i.code === "missing_package_dependency");
    const otherIssues = staticIssues.filter((i) => i.code !== "missing_package_dependency");

    if (missingPkgIssues.length > 0) {
      const missingDeps = [...new Set(
        missingPkgIssues
          .map((i) => {
            const match = i.message.match(/requires missing dependency "([^"]+)"/);
            return match?.[1];
          })
          .filter((dep): dep is string => !!dep && !dep.startsWith(".")),
      )];

      if (missingDeps.length > 0) {
        console.log(`[Pipeline] Auto-installing missing deps: ${missingDeps.join(", ")}`);
        try {
          await npmInstall(projectPath, missingDeps);
          const revalidated = validateGeneratedProject(projectPath, navigationType ?? undefined);
          if (revalidated.length === 0) {
            console.log("[Pipeline] Auto-install resolved all static issues");
          } else {
            errors.push(
              `Static validation failed: ${revalidated
                .map((issue) => `${issue.filePath ?? "project"}: ${issue.message}`)
                .join("; ")}`,
            );
            return { success: false, errors };
          }
        } catch (installErr) {
          console.warn(
            `[Pipeline] Auto-install failed: ${installErr instanceof Error ? installErr.message : String(installErr)}`,
          );
          errors.push(
            `Static validation failed: ${staticIssues
              .map((issue) => `${issue.filePath ?? "project"}: ${issue.message}`)
              .join("; ")}`,
          );
          return { success: false, errors };
        }
      }
    }

    if (otherIssues.length > 0) {
      errors.push(
        `Static validation failed: ${otherIssues
          .map((issue) => `${issue.filePath ?? "project"}: ${issue.message}`)
          .join("; ")}`,
      );
      return { success: false, errors };
    }
  }

  const typecheckResult = await runTypecheck(projectPath);
  if (!typecheckResult.success) {
    errors.push(`Typecheck failed:\n${summarizeOutput(typecheckResult.combinedOutput)}`);
    return { success: false, errors };
  }

  const webExportResult = await runWebExport(projectPath);
  if (!webExportResult.success) {
    errors.push(`Web export failed:\n${summarizeOutput(webExportResult.combinedOutput)}`);
    return { success: false, errors };
  }

  const androidSmokeResult = await runNativeSmoke(projectPath, "android");
  if (!androidSmokeResult.success) {
    errors.push(`Android smoke gate failed:\n${summarizeOutput(androidSmokeResult.combinedOutput)}`);
    return { success: false, errors };
  }

  if (process.platform === "darwin") {
    const iosSmokeResult = await runNativeSmoke(projectPath, "ios");
    if (!iosSmokeResult.success) {
      errors.push(`iOS smoke gate failed:\n${summarizeOutput(iosSmokeResult.combinedOutput)}`);
      return { success: false, errors };
    }
  }

  return { success: true, errors };
};
