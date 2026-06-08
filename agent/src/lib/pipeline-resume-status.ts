// Emits resume_status WS events so the UI shows Continue after interrupted codegen.
import { getProjectResumeStatus } from "./generation-state.js";
import type { OutboundMessage } from "./ws-contract.js";

type ResumeStatusMessage = Extract<OutboundMessage, { type: "resume_status" }>;

export const buildResumeStatusMessage = (
  projectName: string,
): ResumeStatusMessage => {
  const status = getProjectResumeStatus(projectName);
  return {
    type: "resume_status",
    canResume: status.canResume,
    resumeMode: status.resumeMode,
    missingFileCount: status.missingFileCount,
    totalPlanFiles: status.totalPlanFiles,
    checkpoint: status.checkpoint,
  };
};
