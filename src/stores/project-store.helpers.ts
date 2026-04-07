// Keeps project and preview store transitions pure so lifecycle changes remain testable.
import type {
  ProjectChat,
  ProjectState,
} from "./project-store.types";

export const MAX_CACHED_FILES = 80;
export const EMPTY_CHAT: Readonly<ProjectChat> = {
  messages: [],
  versions: [],
  fileTree: [],
  openFiles: [],
  activeFile: null,
  fileContents: {},
  streamingContent: "",
  previewUrl: null,
  previewPort: null,
};

export const createEmptyChat = (): ProjectChat => ({
  ...EMPTY_CHAT,
  messages: [],
  versions: [],
  fileTree: [],
  openFiles: [],
  fileContents: {},
});

export const saveProjectChatPatch = (
  chats: Record<string, ProjectChat>,
  projectName: string | null,
  patch: Partial<ProjectChat>
): Record<string, ProjectChat> => {
  if (!projectName) {
    return chats;
  }

  const existing = chats[projectName] ?? createEmptyChat();
  return {
    ...chats,
    [projectName]: {
      ...existing,
      ...patch,
    },
  };
};

export const limitFileContents = (
  fileContents: Record<string, string>
): Record<string, string> => {
  const entries = Object.entries(fileContents);
  if (entries.length <= MAX_CACHED_FILES) {
    return fileContents;
  }

  return Object.fromEntries(entries.slice(entries.length - MAX_CACHED_FILES));
};

export const applyProjectFileSnapshot = (
  state: ProjectState,
  projectName: string,
  fileTree: ProjectChat["fileTree"],
  fileContents: Record<string, string>
): Partial<ProjectState> => {
  const existingChat = state.projectChats[projectName] ?? createEmptyChat();
  const nextFileContents = limitFileContents({
    ...existingChat.fileContents,
    ...fileContents,
  });
  const projectChats = {
    ...state.projectChats,
    [projectName]: {
      ...existingChat,
      fileTree,
      fileContents: nextFileContents,
    },
  };

  if (state.projectName !== projectName) {
    return { projectChats };
  }

  return {
    projectChats,
    fileTree,
    fileContents: nextFileContents,
  };
};

export const persistCurrentProjectSnapshot = (
  state: ProjectState
): Record<string, ProjectChat> => {
  if (!state.projectName) {
    return state.projectChats;
  }

  return saveProjectChatPatch(state.projectChats, state.projectName, {
    messages: state.messages,
    fileTree: state.fileTree,
    openFiles: state.openFiles,
    activeFile: state.activeFile,
    fileContents: state.fileContents,
    versions: state.versions,
    streamingContent: state.streamingContent,
    previewUrl: state.previewUrl,
    previewPort: state.previewPort,
  });
};

export const buildProjectRemovalState = (
  state: ProjectState,
  projectName: string
): Partial<ProjectState> => {
  const projectList = state.projectList.filter((project) => project.name !== projectName);
  const isActiveProject = state.projectName === projectName;
  const { [projectName]: _removed, ...projectChats } = state.projectChats;

  if (!isActiveProject) {
    return { projectList, projectChats };
  }

  const nextProject = projectList[0];
  const nextChat = nextProject
    ? (projectChats[nextProject.name] ?? EMPTY_CHAT)
    : EMPTY_CHAT;

  return {
    projectList,
    projectChats,
    projectName: nextProject?.name ?? null,
    status: nextProject?.status ?? "idle",
    previewStatus: "stopped",
    messages: nextChat.messages,
    fileTree: nextChat.fileTree,
    openFiles: nextChat.openFiles,
    activeFile: nextChat.activeFile,
    fileContents: nextChat.fileContents,
    versions: nextChat.versions,
    streamingContent: nextChat.streamingContent,
    previewUrl: nextChat.previewUrl,
    previewPort: nextChat.previewPort,
    previewBuildId: null,
    previewRevision: 0,
    lastPreviewError: null,
  };
};

export const buildProjectSwitchState = (
  state: ProjectState,
  projectName: string
): Partial<ProjectState> => {
  const projectChats = persistCurrentProjectSnapshot(state);
  const nextChat = projectChats[projectName] ?? EMPTY_CHAT;
  const nextStatus = state.projectList.find((project) => project.name === projectName)?.status ?? "ready";

  return {
    projectName,
    status: nextStatus,
    previewStatus: "stopped",
    projectChats,
    messages: nextChat.messages,
    fileTree: nextChat.fileTree,
    openFiles: nextChat.openFiles,
    activeFile: nextChat.activeFile,
    fileContents: nextChat.fileContents,
    versions: nextChat.versions,
    streamingContent: nextChat.streamingContent,
    previewUrl: null,
    previewPort: null,
    previewBuildId: null,
    previewRevision: 0,
    lastPreviewError: null,
  };
};

export const buildPersistedProjectChats = (
  projectChats: Record<string, ProjectChat>
): Record<string, ProjectChat> =>
  Object.fromEntries(
    Object.entries(projectChats).map(([name, chat]) => [
      name,
      {
        messages: chat.messages.slice(-50),
        versions: chat.versions,
        fileTree: chat.fileTree,
        openFiles: chat.openFiles,
        activeFile: chat.activeFile,
        fileContents: {},
        streamingContent: "",
        previewUrl: null,
        previewPort: null,
      },
    ])
  );
