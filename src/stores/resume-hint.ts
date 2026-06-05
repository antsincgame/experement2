// Syncs agent resume status into projectList so Continue/Abort affordances stay accurate.
import { apiClient, type ProjectResumeStatus } from "@/shared/lib/api-client";
import { warnCaught } from "@/shared/lib/catch-log";
import { createSystemMessage } from "@/features/chat/schemas/message.schema";
import { useProjectStore } from "@/stores/project-store";

export const refreshResumeHint = async (
  projectName: string,
): Promise<ProjectResumeStatus | null> => {
  try {
    const fetched = await apiClient.getProjectResumeStatus(projectName);
    const store = useProjectStore.getState();
    const existing = store.projectList.find((entry) => entry.name === projectName);
    if (existing) {
      store.addProject({
        ...existing,
        canResume: fetched.canResume,
        missingFileCount: fetched.missingFileCount,
      });
    }
    return fetched;
  } catch (error) {
    warnCaught("resume-hint", error, `getProjectResumeStatus(${projectName}) failed`);
    return null;
  }
};

export const announceShipRetry = (projectName: string): void => {
  const store = useProjectStore.getState();
  if (store.projectName !== projectName) {
    return;
  }
  const alreadyNotified = store.messages.some(
    (message) =>
      message.role !== "user" &&
      message.content.includes("preview did not ship"),
  );
  if (alreadyNotified) {
    return;
  }
  store.addMessage(
    createSystemMessage(
      "All planned files are written, but preview did not ship. Press **Continue** to rerun gates and Metro.",
      false,
    ),
  );
};

export const announceIncompleteGeneration = (
  projectName: string,
  missingFileCount: number,
  totalPlanFiles: number,
): void => {
  const store = useProjectStore.getState();
  if (store.projectName !== projectName) {
    return;
  }
  const alreadyNotified = store.messages.some(
    (message) =>
      message.role !== "user" &&
      message.content.includes("Generation stopped") &&
      message.content.includes(String(missingFileCount)),
  );
  if (alreadyNotified) {
    return;
  }
  store.addMessage(
    createSystemMessage(
      `Generation stopped before all files were written (${missingFileCount} of ${totalPlanFiles} missing). Press **Continue generation** to finish from the saved plan.`,
      false,
    ),
  );
};
