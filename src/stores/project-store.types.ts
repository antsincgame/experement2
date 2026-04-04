// Defines shared project store types so slices and handlers can evolve without circular imports.
import type { StoreApi } from "zustand";
import type { ChatMessage } from "@/features/chat/schemas/message.schema";
import type { IncomingWsMessage } from "@/shared/schemas/ws-messages";

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
  projectChats: Record<string, ProjectChat>;
}

export interface ProjectStateActions {
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
  handleWsMessage: (msg: IncomingWsMessage) => void;
}

export type ProjectState = ProjectStateData & ProjectStateActions;
export type ProjectStoreSet = StoreApi<ProjectState>["setState"];
export type ProjectStoreGet = () => ProjectState;
