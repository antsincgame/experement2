// Keeps project and preview store transitions pure so lifecycle changes remain testable.
import { CREATING_PROJECT_SLUG, isCreatingRoute } from "@/shared/lib/creation-flow";
import { readProjectWorkspaceCache } from "./project-cache";
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
    plan: state.plan,
    generationFiles: state.generationFiles,
    generationProgress: state.generationProgress,
    currentGeneratingFile: state.currentGeneratingFile,
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
    fileDrafts: {},
    versions: nextChat.versions,
    streamingContent: nextChat.streamingContent,
    previewUrl: nextChat.previewUrl,
    previewPort: nextChat.previewPort,
    previewBuildId: null,
    previewRevision: 0,
    lastPreviewError: null,
  };
};

export const migrateCreatingChatToProject = (
  projectChats: Record<string, ProjectChat>,
  targetName: string,
  state: ProjectState
): Record<string, ProjectChat> => {
  const { [CREATING_PROJECT_SLUG]: creatingChat, ...rest } = projectChats;
  const base = creatingChat ?? createEmptyChat();
  return {
    ...rest,
    [targetName]: {
      ...base,
      messages: state.messages.length > 0 ? state.messages : base.messages,
      streamingContent: state.streamingContent || base.streamingContent,
    },
  };
};

export const buildProjectSwitchState = (
  state: ProjectState,
  projectName: string
): Partial<ProjectState> => {
  const projectChats = persistCurrentProjectSnapshot(state);
  const creating = isCreatingRoute(projectName);
  const storedChat = projectChats[projectName] ?? EMPTY_CHAT;
  const nextChat = creating
    ? {
      ...storedChat,
      messages: state.messages.length > 0 ? state.messages : storedChat.messages,
      streamingContent: state.streamingContent || storedChat.streamingContent,
    }
    : storedChat;
  const nextStatus = creating
    ? state.status
    : state.projectList.find((project) => project.name === projectName)?.status ?? "ready";
  const workspace = readProjectWorkspaceCache(projectChats, projectName);

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
    fileDrafts: {},
    versions: nextChat.versions,
    plan: workspace.plan,
    streamingContent: workspace.streamingContent,
    generationFiles: workspace.generationFiles,
    generationProgress: workspace.generationProgress,
    currentGeneratingFile: workspace.currentGeneratingFile,
    previewUrl: null,
    previewPort: null,
    previewBuildId: null,
    previewRevision: 0,
    lastPreviewError: null,
  };
};

/**
 * Starts a brand-new creation from a clean slate. Persists the currently-active
 * REAL project (so its chat is not lost), drops any stale "__creating__"
 * placeholder chat left by a previous failed/aborted creation, and resets the
 * live workspace to empty. Without this, switching to the placeholder slug
 * re-hydrated the previous broken creation's messages, so a new project "landed"
 * in the old, homeless project's chat (AUDIT C2).
 */
export const buildCreationStartState = (
  state: ProjectState
): Partial<ProjectState> => {
  const persisted = persistCurrentProjectSnapshot(state);
  const { [CREATING_PROJECT_SLUG]: _stalePlaceholder, ...projectChats } = persisted;

  return {
    projectName: CREATING_PROJECT_SLUG,
    status: "planning",
    previewStatus: "stopped",
    plan: null,
    projectChats: {
      ...projectChats,
      [CREATING_PROJECT_SLUG]: createEmptyChat(),
    },
    messages: [],
    fileTree: [],
    openFiles: [],
    activeFile: null,
    fileContents: {},
    fileDrafts: {},
    versions: [],
    currentVersion: 0,
    streamingContent: "",
    generationFiles: [],
    generationProgress: 0,
    currentGeneratingFile: null,
    previewUrl: null,
    previewPort: null,
    previewBuildId: null,
    previewRevision: 0,
    lastPreviewError: null,
  };
};

// Diff payloads can be large; drop them from persisted history so localStorage
// stays within quota. The summary text remains, and disk is the source of truth.
const stripHeavyMessageFields = (
  messages: ProjectChat["messages"]
): ProjectChat["messages"] =>
  messages.map(({ diffBefore: _b, diffAfter: _a, diffFilepath: _f, thinking, ...rest }) => ({
    ...rest,
    ...(thinking
      ? { thinking: thinking.length > 12_000 ? `${thinking.slice(-12_000)}` : thinking }
      : {}),
  }));

export const buildPersistedProjectChats = (
  projectChats: Record<string, ProjectChat>
): Record<string, ProjectChat> =>
  Object.fromEntries(
    Object.entries(projectChats)
      // Never persist the transient "__creating__" placeholder — persisting it
      // resurrects a failed creation's chat into the next session.
      .filter(([name]) => name !== CREATING_PROJECT_SLUG)
      .map(([name, chat]) => [
      name,
      {
        messages: stripHeavyMessageFields(chat.messages.slice(-80)),
        versions: chat.versions,
        fileTree: chat.fileTree,
        openFiles: chat.openFiles,
        activeFile: chat.activeFile,
        fileContents: {},
        streamingContent: chat.streamingContent ?? "",
        plan: chat.plan ?? null,
        generationFiles: (chat.generationFiles ?? []).slice(-40),
        generationProgress: chat.generationProgress ?? 0,
        currentGeneratingFile: chat.currentGeneratingFile ?? null,
        previewUrl: null,
        previewPort: null,
      },
    ])
  );
