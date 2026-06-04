// Splits project lifecycle actions out of the main store file so preview runtime can stay separate.
import type {
  AppStatus,
  ProjectEntry,
  ProjectStoreSet,
} from "../project-store.types";
import {
  buildCreationStartState,
  buildProjectRemovalState,
  buildProjectSwitchState,
  createEmptyChat,
} from "../project-store.helpers";

export const createProjectManagementSlice = (set: ProjectStoreSet) => ({
  setProjectName: (projectName: string | null) => set({ projectName }),

  setStatus: (status: AppStatus) =>
    set((state) => ({
      status,
      projectList: state.projectName
        ? state.projectList.map((project) => (
          project.name === state.projectName
            ? { ...project, status }
            : project
        ))
        : state.projectList,
    })),

  setPlan: (plan: Record<string, unknown> | null) => set({ plan }),

  setPendingCreationRequestId: (pendingCreationRequestId: string | null) =>
    set({ pendingCreationRequestId }),

  addProject: (entry: ProjectEntry) =>
    set((state) => ({
      projectList: [
        ...state.projectList.filter((project) => project.name !== entry.name),
        entry,
      ],
      projectChats: state.projectChats[entry.name]
        ? state.projectChats
        : {
          ...state.projectChats,
          [entry.name]: createEmptyChat(),
        },
    })),

  removeProject: (projectName: string) =>
    set((state) => buildProjectRemovalState(state, projectName)),

  switchProject: (projectName: string) =>
    set((state) => buildProjectSwitchState(state, projectName)),

  // Begin a fresh creation: persist the active project, discard any stale
  // "__creating__" placeholder chat, and reset the live workspace to empty so the
  // new project never inherits a previous failed creation's conversation.
  beginCreation: () => set((state) => buildCreationStartState(state)),

  reset: () =>
    set({
      projectName: null,
      projectList: [],
      status: "idle",
      previewStatus: "stopped",
      plan: null,
      messages: [],
      fileTree: [],
      openFiles: [],
      activeFile: null,
      fileContents: {},
      fileDrafts: {},
      versions: [],
      currentVersion: 0,
      previewUrl: null,
      previewPort: null,
      previewBuildId: null,
      previewRevision: 0,
      lastPreviewError: null,
      generationProgress: 0,
      currentGeneratingFile: null,
      generationFiles: [],
      isConnected: false,
      lmStudioStatus: "checking",
      pendingProjectName: null,
      pendingCreationRequestId: null,
      streamingContent: "",
      fileTreeVisible: true,
      terminalVisible: true,
      projectChats: {},
    }),
});
