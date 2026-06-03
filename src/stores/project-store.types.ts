// Defines shared project and preview store types so protocol changes stay explicit across slices.
import type { StoreApi } from "zustand";
import type { ChatMessage } from "@/features/chat/schemas/message.schema";
import type {
  IncomingWsMessage,
  PreviewStatus as PreviewRuntimeStatus,
  ProjectStatus,
} from "@/shared/schemas/ws-messages";

export type AppStatus = ProjectStatus;
export type PreviewStatus = PreviewRuntimeStatus;

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

export type GenerationFileStatus = "streaming" | "done";

export interface GenerationFile {
  path: string;
  code: string;
  status: GenerationFileStatus;
}

export interface ProjectChat {
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

export interface ProjectStateData {
  projectName: string | null;
  projectList: ProjectEntry[];
  status: AppStatus;
  previewStatus: PreviewStatus;
  plan: Record<string, unknown> | null;
  messages: ChatMessage[];
  fileTree: FileNode[];
  openFiles: string[];
  activeFile: string | null;
  fileContents: Record<string, string>;
  fileDrafts: Record<string, string>;
  versions: Version[];
  currentVersion: number;
  previewUrl: string | null;
  previewPort: number | null;
  previewBuildId: string | null;
  previewRevision: number;
  lastPreviewError: string | null;
  generationProgress: number;
  currentGeneratingFile: string | null;
  generationFiles: GenerationFile[];
  isConnected: boolean;
  lmStudioStatus: "connected" | "disconnected" | "checking";
  pendingProjectName: string | null;
  streamingContent: string;
  fileTreeVisible: boolean;
  terminalVisible: boolean;
  projectChats: Record<string, ProjectChat>;
}

export interface ProjectStateActions {
  setProjectName: (name: string | null) => void;
  setStatus: (status: AppStatus) => void;
  setPlan: (plan: Record<string, unknown> | null) => void;
  addMessage: (message: ChatMessage) => void;
  appendBackgroundMessage: (projectName: string, message: ChatMessage) => void;
  updateLastAssistantMessage: (content: string) => void;
  setFileTree: (tree: FileNode[]) => void;
  openFile: (path: string) => void;
  closeFile: (path: string) => void;
  setActiveFile: (path: string | null) => void;
  setFileContent: (path: string, content: string) => void;
  setFileDraft: (path: string, content: string) => void;
  revertFileDraft: (path: string) => void;
  clearFileDraft: (path: string) => void;
  addVersion: (version: Version) => void;
  setCurrentVersion: (num: number) => void;
  setPreview: (url: string | null, port: number | null) => void;
  setPreviewStatus: (
    status: PreviewStatus,
    options?: { error?: string | null; buildId?: string | null }
  ) => void;
  bumpPreviewRevision: () => void;
  setGenerationProgress: (progress: number, file: string | null) => void;
  setConnected: (connected: boolean) => void;
  setLmStudioStatus: (status: "connected" | "disconnected" | "checking") => void;
  setPendingProjectName: (name: string | null) => void;
  appendStreamingContent: (chunk: string) => void;
  clearStreamingContent: () => void;
  startGenerationFile: (path: string) => void;
  appendGenerationCode: (chunk: string) => void;
  completeGenerationFile: (path: string) => void;
  resetGenerationFiles: () => void;
  toggleFileTree: () => void;
  toggleTerminal: () => void;
  addProject: (entry: ProjectEntry) => void;
  removeProject: (name: string) => void;
  switchProject: (name: string) => void;
  reset: () => void;
  handleWsMessage: (msg: IncomingWsMessage) => void;
}

export type ProjectState = ProjectStateData & ProjectStateActions;
export type ProjectStoreSet = StoreApi<ProjectState>["setState"];
export type ProjectStoreGet = () => ProjectState;
