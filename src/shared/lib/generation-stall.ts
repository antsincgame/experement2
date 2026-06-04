// Detects UI/codegen desync when the agent went idle but files still show as streaming.
import type { GenerationFileActivity } from "./generation-status";

export const getStalledStreamingPaths = (
  files: GenerationFileActivity[],
): string[] =>
  files.filter((file) => file.status === "streaming").map((file) => file.path);

export const hasStalledGenerationUi = (
  status: string,
  files: GenerationFileActivity[],
): boolean =>
  !["planning", "scaffolding", "generating", "building", "analyzing", "validating"].includes(
    status,
  ) && getStalledStreamingPaths(files).length > 0;
