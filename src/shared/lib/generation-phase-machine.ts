// Single source for generation phase order and all UI phase transitions (WS + local).
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

/** Every way the active project phase can change — map WS handlers to these signals only. */
export type GenerationPhaseSignal =
  | { kind: "agent_status"; status: ProjectStatus }
  | { kind: "scaffold_complete" }
  | { kind: "build_success" }
  | { kind: "preview_ready" }
  | { kind: "generation_aborted" }
  | { kind: "iteration_complete"; failed: boolean }
  | { kind: "fatal_error" };

const SIGNAL_TARGET: Record<
  Exclude<GenerationPhaseSignal["kind"], "agent_status" | "iteration_complete">,
  ProjectStatus
> = {
  scaffold_complete: "generating",
  build_success: "building",
  preview_ready: "ready",
  generation_aborted: "ready",
  fatal_error: "error",
};

const targetForSignal = (signal: GenerationPhaseSignal): ProjectStatus => {
  if (signal.kind === "agent_status") {
    return signal.status;
  }
  if (signal.kind === "iteration_complete") {
    return signal.failed ? "error" : "ready";
  }
  return SIGNAL_TARGET[signal.kind];
};

/**
 * Returns the next phase if the signal should apply; null if blocked (regressive agent_status).
 */
export const resolveGenerationPhase = (
  current: ProjectStatus,
  signal: GenerationPhaseSignal,
): ProjectStatus | null => {
  const target = targetForSignal(signal);
  if (!shouldAdvanceGenerationStatus(current, target)) {
    return null;
  }
  return target;
};
