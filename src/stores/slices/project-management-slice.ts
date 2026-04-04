// Splits project lifecycle actions out of the main store file to reduce cross-domain coupling.
import type {
  AppStatus,
  ProjectEntry,
  ProjectStoreSet,
} from "../project-store.types";
import {
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

  setPlan: (plan: Record<string, unknown>) => set({ plan }),

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

  reset: () =>
    set({
      projectName: null,
      projectList: [],
      status: "idle",
      plan: null,
      messages: [],
      fileTree: [],
      openFiles: [],
      activeFile: null,
      fileContents: {},
      versions: [],
      currentVersion: 0,
      previewUrl: null,
      previewPort: null,
      generationProgress: 0,
      currentGeneratingFile: null,
      isConnected: false,
      lmStudioStatus: "checking",
      pendingProjectName: null,
      streamingContent: "",
      fileTreeVisible: true,
      terminalVisible: true,
      projectChats: {},
    }),
});
