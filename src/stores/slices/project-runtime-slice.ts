// Groups connection and runtime UI flags so volatile state stays separate from persisted project data.
import type { ProjectStoreSet, ProjectStateData } from "../project-store.types";

type LlmStatus = ProjectStateData["lmStudioStatus"];

export const createProjectRuntimeSlice = (set: ProjectStoreSet) => ({
  setConnected: (isConnected: boolean) => set({ isConnected }),
  setPendingProjectName: (pendingProjectName: string | null) => set({ pendingProjectName }),
  setLmStudioStatus: (lmStudioStatus: LlmStatus) => set({ lmStudioStatus }),
});
