// Emits resume_status WS events so the UI shows Continue after interrupted codegen.
import { getProjectResumeStatus } from "./generation-state.js";

export const buildResumeStatusMessage = (
  projectName: string,
): Record<string, unknown> => {
  const status = getProjectResumeStatus(projectName);
  return {
    type: "resume_status",
    canResume: status.canResume,
    missingFileCount: status.missingFileCount,
    totalPlanFiles: status.totalPlanFiles,
    checkpoint: status.checkpoint,
  };
};
