// Shared generation status labels so home and project screens stay consistent.
import type { ProjectStatus } from "@/shared/schemas/ws-messages";

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
