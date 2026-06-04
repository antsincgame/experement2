// Maps agent checkpoints to UI phase timeline — avoids "all green" when only preview started.
import {
  GENERATION_PHASE_RANK,
  GENERATION_STATUS_LABELS,
  isGenerationActive,
} from "./generation-status";
import type { ProjectStatus } from "@/shared/schemas/ws-messages";

export type GenerationCheckpoint = "planned" | "scaffolded" | "codegen" | "shipped" | null;

const CHECKPOINT_MIN_RANK: Record<Exclude<GenerationCheckpoint, null>, number> = {
  planned: GENERATION_PHASE_RANK.planning,
  scaffolded: GENERATION_PHASE_RANK.scaffolding,
  codegen: GENERATION_PHASE_RANK.generating,
  shipped: GENERATION_PHASE_RANK.ready,
};

export const isPipelineFullyShipped = (
  checkpoint: GenerationCheckpoint,
): boolean => checkpoint === "shipped";

export const resolveTimelineRank = (
  status: ProjectStatus,
  checkpoint: GenerationCheckpoint,
): number => {
  const statusRank = GENERATION_PHASE_RANK[status] ?? 0;
  if (!checkpoint) {
    return status === "error" ? GENERATION_PHASE_RANK.validating : statusRank;
  }
  const floor = CHECKPOINT_MIN_RANK[checkpoint];
  if (checkpoint === "shipped") {
    return GENERATION_PHASE_RANK.ready;
  }
  // Preview-only ready (start_preview) must not paint Analyze→Ready as done.
  if (status === "ready") {
    return Math.max(floor, GENERATION_PHASE_RANK.building);
  }
  if (status === "error") {
    return Math.max(floor, statusRank);
  }
  return Math.max(floor, statusRank);
};

export const getGenerationActivityHeader = (
  status: ProjectStatus,
  checkpoint: GenerationCheckpoint,
): string => {
  if (isGenerationActive(status)) {
    return GENERATION_STATUS_LABELS[status] ?? "Building your app…";
  }
  if (checkpoint === "shipped") {
    return "Build complete";
  }
  if (status === "ready") {
    return "Preview ready — full pipeline not recorded";
  }
  if (status === "error") {
    return "Build failed";
  }
  return "Build stopped";
};
