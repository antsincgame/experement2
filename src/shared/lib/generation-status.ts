// Shared generation status labels so home and project screens stay consistent.
import type { ProjectStatus } from "@/shared/schemas/ws-messages";

/** Monotonic pipeline order — UI must not stay on an early phase when later events arrived. */
export const GENERATION_PHASE_RANK: Record<ProjectStatus, number> = {
  idle: -1,
  planning: 0,
  scaffolding: 1,
  generating: 2,
  analyzing: 3,
  validating: 4,
  building: 5,
  ready: 6,
  error: 99,
};

export const shouldAdvanceGenerationStatus = (
  current: ProjectStatus,
  next: ProjectStatus,
): boolean => {
  if (next === "error" || next === "idle") {
    return true;
  }
  return (GENERATION_PHASE_RANK[next] ?? 0) >= (GENERATION_PHASE_RANK[current] ?? 0);
};

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
