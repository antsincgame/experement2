// Composes typed project and preview state so lifecycle and preview runtime can evolve independently.
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { apiClient } from "@/shared/lib/api-client";
import { useSettingsStore } from "./settings-store";
import { createPersistStorage } from "@/shared/lib/storage/persist-storage";
import {
  applyProjectFileSnapshot,
  buildPersistedProjectChats,
} from "./project-store.helpers";
import type {
  AppStatus,
  FileNode,
  ProjectState,
} from "./project-store.types";
import { createProjectChatSlice } from "./slices/project-chat-slice";
import { createProjectManagementSlice } from "./slices/project-management-slice";
import { createProjectRuntimeSlice } from "./slices/project-runtime-slice";
import { createProjectWorkspaceSlice } from "./slices/project-workspace-slice";
import { createWsHandler } from "./slices/ws-handler";

export type {
  AppStatus,
  FileNode,
  ProjectChat,
  ProjectEntry,
  ProjectState,
  Version,
} from "./project-store.types";

const initialState = {
  projectName: null,
  projectList: [],
  status: "idle" as AppStatus,
  previewStatus: "stopped" as const,
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
  previewBuildId: null,
  previewRevision: 0,
  lastPreviewError: null,
  generationProgress: 0,
  currentGeneratingFile: null,
  isConnected: false,
  lmStudioStatus: "checking" as const,
  pendingProjectName: null,
  streamingContent: "",
  fileTreeVisible: true,
  terminalVisible: true,
  projectChats: {},
};

export const useProjectStore = create<ProjectState>()(
  persist(
    (set, get) => ({
      ...initialState,
      ...createProjectManagementSlice(set),
      ...createProjectChatSlice(set),
      ...createProjectWorkspaceSlice(set),
      ...createProjectRuntimeSlice(set),
      handleWsMessage: createWsHandler(set, get, (name) => fetchProjectFiles(name)),
    }),
    {
      name: "app-factory-projects",
      storage: createPersistStorage(),
      partialize: (state) => ({
        projectList: state.projectList,
        projectChats: buildPersistedProjectChats(state.projectChats),
      }),
    }
  )
);

export const fetchProjectFiles = async (
  projectName: string
): Promise<Record<string, string> | null> => {
  try {
    const [fileTree, files] = await Promise.all([
      apiClient.getProjectTree<FileNode[]>(projectName),
      apiClient.listProjectFiles(projectName),
    ]);
    const fileContents: Record<string, string> = {};

    for (const filePath of files) {
      try {
        const fileData = await apiClient.getProjectFile(projectName, filePath);
        fileContents[filePath] = fileData.content;
      } catch {
        useSettingsStore.getState().addErrorLog({ level: "warn", source: "project-store", message: `Failed to load ${filePath}` });
      }
    }

    useProjectStore.setState((state) =>
      applyProjectFileSnapshot(state, projectName, fileTree, fileContents)
    );

    return fileContents;
  } catch {
    useSettingsStore.getState().addErrorLog({ level: "warn", source: "project-store", message: `Failed to hydrate ${projectName}` });
    return null;
  }
};
