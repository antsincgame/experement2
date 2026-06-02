// Turns raw generation events into human-readable "what the agent is doing" narration.
// The meaning of each file comes from the model's own plan descriptions (plan.files[].description),
// so explanations cost ZERO extra tokens — they are already produced during planning.
import type { GenerationFile } from "@/stores/project-store.types";
import type { ProjectStatus } from "@/shared/schemas/ws-messages";
import { GENERATION_STATUS_LABELS } from "@/shared/lib/generation-status";

export interface FileMeaning {
  path: string;
  status: GenerationFile["status"];
  meaning: string;
}

export type TerminalLineTone = "phase" | "active" | "done" | "muted";

export interface TerminalLine {
  key: string;
  text: string;
  tone: TerminalLineTone;
}

/** Extract the model-authored description for each planned file (path -> description). */
export const extractPlanDescriptions = (
  plan: Record<string, unknown> | null,
): Record<string, string> => {
  const result: Record<string, string> = {};
  const files = plan?.files;
  if (!Array.isArray(files)) return result;
  for (const file of files) {
    if (!file || typeof file !== "object") continue;
    const { path, description } = file as { path?: unknown; description?: unknown };
    if (typeof path === "string" && typeof description === "string" && description.trim()) {
      result[path] = description.trim();
    }
  }
  return result;
};

/** Fallback meaning derived from a file path when the plan has no description. */
export const humanizePath = (path: string): string => {
  const base = path.split("/").pop() ?? path;
  const name = base.replace(/\.[^.]+$/, "");
  const words = name
    .replace(/[-_]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim()
    .toLowerCase();
  if (!words) return base;
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/** Best-available human meaning for a file: model description first, path fallback second. */
export const describeFile = (
  path: string,
  descriptions: Record<string, string>,
): string => descriptions[path] ?? humanizePath(path);

/** Per-file meaning list for the chat activity panel (no code, just intent). */
export const buildFileMeanings = (
  files: GenerationFile[],
  plan: Record<string, unknown> | null,
): FileMeaning[] => {
  const descriptions = extractPlanDescriptions(plan);
  return files.map((file) => ({
    path: file.path,
    status: file.status,
    meaning: describeFile(file.path, descriptions),
  }));
};

/** Compact, code-free activity log for the terminal: phase header + per-file progress. */
export const buildTerminalLines = (
  status: ProjectStatus,
  files: GenerationFile[],
  plan: Record<string, unknown> | null,
): TerminalLine[] => {
  const lines: TerminalLine[] = [];
  const phaseLabel = GENERATION_STATUS_LABELS[status];
  if (phaseLabel) {
    lines.push({ key: `phase-${status}`, text: phaseLabel, tone: "phase" });
  }
  const descriptions = extractPlanDescriptions(plan);
  for (const file of files) {
    if (file.status === "done") {
      lines.push({ key: `${file.path}:done`, text: `\u2713 ${file.path}`, tone: "done" });
      continue;
    }
    lines.push({ key: `${file.path}:active`, text: `\u2192 ${file.path}`, tone: "active" });
    lines.push({
      key: `${file.path}:meaning`,
      text: `   ${describeFile(file.path, descriptions)}`,
      tone: "muted",
    });
  }
  return lines;
};
