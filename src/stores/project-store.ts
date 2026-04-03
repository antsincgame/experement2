// Keeps per-project UI state synchronized across scaffold/generation and active workspace switching.
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { apiClient } from "@/shared/lib/api-client";
import type { ChatMessage } from "@/features/chat/schemas/message.schema";
import { createWsHandler } from "./slices/ws-handler";

export type AppStatus =
  | "idle"
  | "planning"
  | "scaffolding"
  | "generating"
  | "building"
  | "analyzing"
  | "validating"
  | "ready"
  | "error";

export interface FileNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileNode[];
}

export interface Version {
  number: number;
  hash: string;
  description: string;
  timestamp: number;
}

export interface ProjectEntry {
  name: string;
  displayName: string;
  status: AppStatus;
  port: number | null;
  createdAt: number;
}

/** Per-project isolated state */
interface ProjectChat {
  messages: ChatMessage[];
  versions: Version[];
  fileTree: FileNode[];
  openFiles: string[];
  activeFile: string | null;
  fileContents: Record<string, string>;
  streamingContent: string;
  previewUrl: string | null;
  previewPort: number | null;
}

/** Stable empty reference for reads вЂ” prevents infinite re-render */
const EMPTY_CHAT: Readonly<ProjectChat> = {
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

const freshChat = (): ProjectChat => ({ ...EMPTY_CHAT, messages: [], versions: [], fileTree: [], openFiles: [], fileContents: {} });

interface ProjectState {
  // Top-level (active project) used by selectors
  projectName: string | null;
  projectList: ProjectEntry[];
  status: AppStatus;
  plan: Record<string, unknown> | null;
  messages: ChatMessage[];
  fileTree: FileNode[];
  openFiles: string[];
  activeFile: string | null;
  fileContents: Record<string, string>;
  versions: Version[];
  currentVersion: number;
  previewUrl: string | null;
  previewPort: number | null;
  generationProgress: number;
  currentGeneratingFile: string | null;
  isConnected: boolean;
  lmStudioStatus: "connected" | "disconnected" | "checking";
  pendingProjectName: string | null;
  streamingContent: string;
  fileTreeVisible: boolean;
  terminalVisible: boolean;
  // Per-project persistence map
  projectChats: Record<string, ProjectChat>;
  // Actions
  setProjectName: (name: string | null) => void;
  setStatus: (status: AppStatus) => void;
  setPlan: (plan: Record<string, unknown>) => void;
  addMessage: (message: ChatMessage) => void;
  updateLastAssistantMessage: (content: string) => void;
  setFileTree: (tree: FileNode[]) => void;
  openFile: (path: string) => void;
  closeFile: (path: string) => void;
  setActiveFile: (path: string | null) => void;
  setFileContent: (path: string, content: string) => void;
  addVersion: (version: Version) => void;
  setCurrentVersion: (num: number) => void;
  setPreview: (url: string | null, port: number | null) => void;
  setGenerationProgress: (progress: number, file: string | null) => void;
  setConnected: (connected: boolean) => void;
  setLmStudioStatus: (status: "connected" | "disconnected" | "checking") => void;
  setPendingProjectName: (name: string | null) => void;
  appendStreamingContent: (chunk: string) => void;
  clearStreamingContent: () => void;
  toggleFileTree: () => void;
  toggleTerminal: () => void;
  addProject: (entry: ProjectEntry) => void;
  removeProject: (name: string) => void;
  switchProject: (name: string) => void;
  reset: () => void;
  handleWsMessage: (msg: Record<string, unknown>) => void;
}

/** Save current top-level state into projectChats for the given project */
const saveToChats = (
  chats: Record<string, ProjectChat>,
  name: string | null,
  patch: Partial<ProjectChat>
): Record<string, ProjectChat> => {
  if (!name) return chats;
  const existing = chats[name] ?? freshChat();
  return { ...chats, [name]: { ...existing, ...patch } };
};

const MAX_CACHED_FILES = 80;

const limitFileContents = (
  fileContents: Record<string, string>
): Record<string, string> => {
  const entries = Object.entries(fileContents);
  if (entries.length <= MAX_CACHED_FILES) {
    return fileContents;
  }

  return Object.fromEntries(entries.slice(entries.length - MAX_CACHED_FILES));
};

const applyProjectFileSnapshot = (
  state: ProjectState,
  projectName: string,
  fileTree: FileNode[],
  fileContents: Record<string, string>
): Partial<ProjectState> => {
  const existingChat = state.projectChats[projectName] ?? freshChat();
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

export const useProjectStore = create<ProjectState>()(persist((set, get) => ({
  // Top-level state
  projectName: null,
  projectList: [],
  status: "idle" as AppStatus,
  plan: null,
  messages: [] as ChatMessage[],
  fileTree: [] as FileNode[],
  openFiles: [] as string[],
  activeFile: null as string | null,
  fileContents: {} as Record<string, string>,
  versions: [] as Version[],
  currentVersion: 0,
  previewUrl: null as string | null,
  previewPort: null as number | null,
  generationProgress: 0,
  currentGeneratingFile: null as string | null,
  isConnected: false,
  lmStudioStatus: "checking" as "connected" | "disconnected" | "checking",
  pendingProjectName: null as string | null,
  streamingContent: "",
  fileTreeVisible: true,
  terminalVisible: true,
  projectChats: {} as Record<string, ProjectChat>,
  // Actions
  setProjectName: (projectName) => set({ projectName }),
  setStatus: (status) =>
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
  setPlan: (plan) => set({ plan }),

  addMessage: (message) =>
    set((s) => {
      const next = [...s.messages, message];
      const messages = next.length > 200 ? next.slice(-200) : next;
      return { messages, projectChats: saveToChats(s.projectChats, s.projectName, { messages }) };
    }),

  updateLastAssistantMessage: (content) =>
    set((s) => {
      const msgs = [...s.messages];
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === "assistant") {
          msgs[i] = { ...msgs[i], content, status: "streaming" };
          break;
        }
      }
      return { messages: msgs, projectChats: saveToChats(s.projectChats, s.projectName, { messages: msgs }) };
    }),

  setFileTree: (fileTree) =>
    set((s) => ({ fileTree, projectChats: saveToChats(s.projectChats, s.projectName, { fileTree }) })),

  openFile: (path) =>
    set((s) => {
      const openFiles = s.openFiles.includes(path) ? s.openFiles : [...s.openFiles, path];
      return { openFiles, activeFile: path, projectChats: saveToChats(s.projectChats, s.projectName, { openFiles, activeFile: path }) };
    }),

  closeFile: (path) =>
    set((s) => {
      const openFiles = s.openFiles.filter((f) => f !== path);
      const activeFile = s.activeFile === path ? (openFiles[openFiles.length - 1] ?? null) : s.activeFile;
      return { openFiles, activeFile, projectChats: saveToChats(s.projectChats, s.projectName, { openFiles, activeFile }) };
    }),

  setActiveFile: (activeFile) =>
    set((s) => ({ activeFile, projectChats: saveToChats(s.projectChats, s.projectName, { activeFile }) })),

  setFileContent: (path, content) =>
    set((s) => {
      const merged = { ...s.fileContents, [path]: content };
      const keys = Object.keys(merged);
      const fileContents = keys.length > MAX_CACHED_FILES
        ? Object.fromEntries(keys.slice(keys.length - MAX_CACHED_FILES).map((k) => [k, merged[k]]))
        : merged;
      return { fileContents, projectChats: saveToChats(s.projectChats, s.projectName, { fileContents }) };
    }),

  addVersion: (version) =>
    set((s) => {
      const versions = [...s.versions, version];
      return { versions, currentVersion: version.number, projectChats: saveToChats(s.projectChats, s.projectName, { versions }) };
    }),

  setCurrentVersion: (currentVersion) => set({ currentVersion }),

  setPreview: (previewUrl, previewPort) =>
    set((s) => ({ previewUrl, previewPort, projectChats: saveToChats(s.projectChats, s.projectName, { previewUrl, previewPort }) })),

  setGenerationProgress: (generationProgress, currentGeneratingFile) =>
    set({ generationProgress, currentGeneratingFile }),

  setConnected: (isConnected) => set({ isConnected }),
  setPendingProjectName: (pendingProjectName) => set({ pendingProjectName }),
  setLmStudioStatus: (lmStudioStatus) => set({ lmStudioStatus }),

  appendStreamingContent: (chunk) =>
    set((s) => {
      const next = s.streamingContent + chunk;
      const streamingContent = next.length > 12_000 ? next.slice(-12_000) : next;
      return { streamingContent, projectChats: saveToChats(s.projectChats, s.projectName, { streamingContent }) };
    }),

  clearStreamingContent: () =>
    set((s) => ({ streamingContent: "", projectChats: saveToChats(s.projectChats, s.projectName, { streamingContent: "" }) })),

  toggleFileTree: () => set((s) => ({ fileTreeVisible: !s.fileTreeVisible })),
  toggleTerminal: () => set((s) => ({ terminalVisible: !s.terminalVisible })),

  addProject: (entry) =>
    set((s) => ({
      projectList: [...s.projectList.filter((p) => p.name !== entry.name), entry],
      projectChats: s.projectChats[entry.name] ? s.projectChats : { ...s.projectChats, [entry.name]: freshChat() },
    })),

  removeProject: (name) =>
    set((s) => {
      const newList = s.projectList.filter((p) => p.name !== name);
      const isActive = s.projectName === name;
      const { [name]: _removed, ...restChats } = s.projectChats;
      if (!isActive) return { projectList: newList, projectChats: restChats };
      // Switch to first remaining or go idle
      const next = newList[0];
      const chat = next ? (restChats[next.name] ?? EMPTY_CHAT) : EMPTY_CHAT;
      return {
        projectList: newList,
        projectChats: restChats,
        projectName: next?.name ?? null,
        status: next?.status ?? "idle",
        messages: chat.messages,
        fileTree: chat.fileTree,
        openFiles: chat.openFiles,
        activeFile: chat.activeFile,
        fileContents: chat.fileContents,
        versions: chat.versions,
        streamingContent: chat.streamingContent,
        previewUrl: chat.previewUrl,
        previewPort: chat.previewPort,
      };
    }),
  // Core: switch restores from projectChats
  switchProject: (name) =>
    set((s) => {
      // Save current project state first
      const saved = s.projectName
        ? saveToChats(s.projectChats, s.projectName, {
            messages: s.messages,
            fileTree: s.fileTree,
            openFiles: s.openFiles,
            activeFile: s.activeFile,
            fileContents: s.fileContents,
            versions: s.versions,
            streamingContent: s.streamingContent,
            previewUrl: s.previewUrl,
            previewPort: s.previewPort,
          })
        : s.projectChats;
      // Restore target project (preview reset — will be set by start_preview response)
      const chat = saved[name] ?? EMPTY_CHAT;
      return {
        projectName: name,
        status: s.projectList.find((project) => project.name === name)?.status ?? "ready",
        projectChats: saved,
        messages: chat.messages,
        fileTree: chat.fileTree,
        openFiles: chat.openFiles,
        activeFile: chat.activeFile,
        fileContents: chat.fileContents,
        versions: chat.versions,
        streamingContent: chat.streamingContent,
        previewUrl: null,
        previewPort: null,
      };
    }),

  reset: () => set({
    projectName: null, projectList: [], status: "idle" as AppStatus, plan: null,
    messages: [], fileTree: [], openFiles: [], activeFile: null, fileContents: {},
    versions: [], currentVersion: 0, previewUrl: null, previewPort: null,
    generationProgress: 0, currentGeneratingFile: null, isConnected: false,
    lmStudioStatus: "checking" as "connected" | "disconnected" | "checking",
    streamingContent: "", fileTreeVisible: true, terminalVisible: true, projectChats: {},
  }),
  // WebSocket message handler — delegated to extracted module
  handleWsMessage: (msg) => {
    // Lazy reference to avoid hoisting issue with fetchProjectFiles
    const handler = createWsHandler(set, get as never, fetchProjectFiles);
    handler(msg);
  },
}), {
  name: "app-factory-projects",
  storage: createJSONStorage(() => localStorage),
  partialize: (state) => ({
    projectList: state.projectList,
    // Persist only lightweight data — exclude fileContents (8MB+) and streamingContent
    projectChats: Object.fromEntries(
      Object.entries(state.projectChats).map(([name, chat]) => [
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
    ),
  }),
}));
  // File fetch helper
export const fetchProjectFiles = async (projectName: string): Promise<void> => {
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
      } catch (error) {
        // File load failed — skip silently
      }
    }

    useProjectStore.setState((state) =>
      applyProjectFileSnapshot(state, projectName, fileTree, fileContents)
    );
  } catch (error) {
    // Project files load failed — agent may be offline
  }
};


