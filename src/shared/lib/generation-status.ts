// Shared generation status labels so home and project screens stay consistent.
import type { ProjectStatus } from "@/shared/schemas/ws-messages";

export {
  GENERATION_PHASE_RANK,
  shouldAdvanceGenerationStatus,
} from "./generation-phase-machine";

/** Compact one-liners for sidebar, preview overlay, and activity headers. */
export const GENERATION_STATUS_LABELS: Partial<Record<ProjectStatus, string>> = {
  planning: "Planning your app…",
  scaffolding: "Scaffolding the shell…",
  generating: "Writing your code…",
  building: "Warming up preview…",
  analyzing: "Checking contracts…",
  validating: "Quality gates…",
};

export const isGenerationActive = (status: ProjectStatus): boolean =>
  !["idle", "ready", "error"].includes(status);

export type GenerationFileActivity = {
  path: string;
  status: "streaming" | "done";
};

export const hasStreamingGenerationFiles = (
  files: GenerationFileActivity[],
): boolean => files.some((file) => file.status === "streaming");

/** True while the agent pipeline is running OR the UI still shows an in-flight file. */
export const isPipelineBusy = (
  status: ProjectStatus,
  generationFiles: GenerationFileActivity[],
): boolean => isGenerationActive(status) || hasStreamingGenerationFiles(generationFiles);
