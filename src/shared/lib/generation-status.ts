// Shared generation status labels so home and project screens stay consistent.
import type { ProjectStatus } from "@/shared/schemas/ws-messages";

export const GENERATION_STATUS_LABELS: Partial<Record<ProjectStatus, string>> = {
  planning: "Planning app architecture…",
  scaffolding: "Scaffolding project…",
  generating: "Generating code…",
  building: "Building with Metro…",
  analyzing: "Analyzing codebase…",
  validating: "Running quality checks…",
};

export const isGenerationActive = (status: ProjectStatus): boolean =>
  !["idle", "ready", "error"].includes(status);
