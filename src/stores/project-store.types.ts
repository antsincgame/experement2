// Defines shared project and preview store types so protocol changes stay explicit across slices.
import type { StoreApi } from "zustand";
import type { ChatMessage } from "@/features/chat/schemas/message.schema";
import type {
  IncomingWsMessage,
  PreviewStatus as PreviewRuntimeStatus,
  ProjectStatus,
} from "@/shared/schemas/ws-messages";
import type { ProjectWorkspaceCache } from "./project-cache";

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
  /** Disk project has saved plan + missing planned files — show resume affordance. */
  canResume?: boolean;
  missingFileCount?: number;
  /** Preview was paused/evicted (LRU or idle) — show a sleeping badge; wakes on open. */
  previewSleeping?: boolean;
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
  /** Index of the version highlighted as "current" in the timeline — persisted so the highlight survives reload/switch. */
  currentVersion?: number;
  fileTree: FileNode[];
  openFiles: string[];
  activeFile: string | null;
  fileContents: Record<string, string>;
  streamingContent: string;
  previewUrl: string | null;
  previewPort: number | null;
  /** Cached while user views another project — restored on switchProject. */
  plan?: Record<string, unknown> | null;
  generationFiles?: GenerationFile[];
  generationProgress?: number;
  currentGeneratingFile?: string | null;
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
  /** Agent checkpoint from resume_status / status API — truth for pipeline completeness. */
  generationCheckpoint: "planned" | "scaffolded" | "codegen" | "shipped" | null;
  isConnected: boolean;
  lmStudioStatus: "connected" | "disconnected" | "checking";
  pendingProjectName: string | null;
  // requestId of the in-flight create_project, used to scope WS events to THIS
  // creation so stale/background events from a previous run can't mutate it.
  pendingCreationRequestId: string | null;
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
  setGenerationCheckpoint: (
    checkpoint: ProjectStateData["generationCheckpoint"],
  ) => void;
  setPendingProjectName: (name: string | null) => void;
  setPendingCreationRequestId: (requestId: string | null) => void;
  appendStreamingContent: (chunk: string) => void;
  ensurePlanDraftingMessage: (targetProject?: string | null) => void;
  applyPlanBriefToChat: (
    plan: Record<string, unknown>,
    planBrief?: string,
    targetProject?: string | null,
  ) => void;
  appendReasoningMessage: (thinking: string, targetProject?: string | null) => void;
  completeFileMessage: (filepath: string, targetProject?: string | null) => void;
  syncProjectWorkspace: (
    projectName: string,
    patch: Partial<ProjectWorkspaceCache>,
  ) => void;
  clearStreamingContent: () => void;
  startGenerationFile: (path: string, targetProject?: string | null) => void;
  appendGenerationCode: (chunk: string, targetProject?: string | null) => void;
  completeGenerationFile: (path: string, targetProject?: string | null) => void;
  resetGenerationFiles: () => void;
  toggleFileTree: () => void;
  toggleTerminal: () => void;
  addProject: (entry: ProjectEntry) => void;
  removeProject: (name: string) => void;
  switchProject: (name: string) => void;
  beginCreation: () => void;
  reset: () => void;
  handleWsMessage: (msg: IncomingWsMessage) => void;
}

export type ProjectState = ProjectStateData & ProjectStateActions;
export type ProjectStoreSet = StoreApi<ProjectState>["setState"];
export type ProjectStoreGet = () => ProjectState;
