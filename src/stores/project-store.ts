import { create } from "zustand";
import type { ChatMessage } from "@/features/chat/schemas/message.schema";
import {
  createAssistantMessage,
  createSystemMessage,
} from "@/features/chat/schemas/message.schema";

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

/** Stable empty reference for reads — prevents infinite re-render */
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
  // ── Top-level (active project) — used by selectors ──
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
  streamingContent: string;
  fileTreeVisible: boolean;
  terminalVisible: boolean;

  // ── Per-project persistence map ──
  projectChats: Record<string, ProjectChat>;

  // ── Actions ──
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

export const useProjectStore = create<ProjectState>()((set, get) => ({
  // ── Top-level state ──
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
  streamingContent: "",
  fileTreeVisible: true,
  terminalVisible: true,
  projectChats: {} as Record<string, ProjectChat>,

  // ── Actions (dual-write: top-level + projectChats) ──
  setProjectName: (projectName) => set({ projectName }),
  setStatus: (status) => set({ status }),
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
      const updated = { ...s.fileContents, [path]: content };
      const keys = Object.keys(updated);
      if (keys.length > 40) { for (const k of keys.slice(0, keys.length - 40)) delete updated[k]; }
      return { fileContents: updated, projectChats: saveToChats(s.projectChats, s.projectName, { fileContents: updated }) };
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

  // ── CORE: switch restores from projectChats ──
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
      // Restore target project
      const chat = saved[name] ?? EMPTY_CHAT;
      return {
        projectName: name,
        status: "ready",
        projectChats: saved,
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

  reset: () => set({
    projectName: null, projectList: [], status: "idle" as AppStatus, plan: null,
    messages: [], fileTree: [], openFiles: [], activeFile: null, fileContents: {},
    versions: [], currentVersion: 0, previewUrl: null, previewPort: null,
    generationProgress: 0, currentGeneratingFile: null, isConnected: false,
    lmStudioStatus: "checking" as "connected" | "disconnected" | "checking",
    streamingContent: "", fileTreeVisible: true, terminalVisible: true, projectChats: {},
  }),

  // ── WebSocket message handler ──
  handleWsMessage: (msg) => {
    const type = msg.type as string;
    const store = get();

    switch (type) {
      case "connected": set({ isConnected: true }); break;
      case "status": set({ status: msg.status as AppStatus }); break;
      case "plan_chunk": store.appendStreamingContent(msg.chunk as string); break;

      case "plan_complete":
        set({ plan: msg.plan as Record<string, unknown> });
        store.clearStreamingContent();
        store.addMessage(createSystemMessage("План приложения создан ✓", false));
        break;

      case "scaffold_complete":
        set({ projectName: msg.projectName as string });
        store.addMessage(createSystemMessage("Проект создан из кэша ✓", true));
        break;

      case "file_generating":
        set({ generationProgress: msg.progress as number, currentGeneratingFile: msg.filepath as string });
        break;

      case "code_chunk": store.appendStreamingContent(msg.chunk as string); break;
      case "file_complete": store.addMessage(createSystemMessage(`Файл создан: ${msg.filepath}`, true)); break;

      case "generation_complete":
        store.clearStreamingContent();
        store.addMessage(createAssistantMessage(`Сгенерировано ${msg.filesCount} файлов ✓`));
        break;

      case "build_event": break;

      case "preview_ready":
        store.setPreview(msg.proxyUrl as string, msg.port as number);
        set({ status: "ready" });
        store.addMessage(createAssistantMessage("Preview ready! App is running."));
        { const pName = get().projectName; if (pName) fetchProjectFiles("http://localhost:3100", pName); }
        break;

      case "thinking": store.addMessage(createAssistantMessage(msg.content as string)); break;
      case "analysis_complete": store.addMessage(createSystemMessage(`Анализ: чтение ${(msg.files as string[]).join(", ")}`, true)); break;
      case "block_applied": store.addMessage(createSystemMessage(`Изменён: ${msg.filepath}`, true)); break;

      case "iteration_complete": {
        const applied = msg.applied as number;
        const failed = msg.failed as number;
        store.addMessage(createAssistantMessage(failed > 0 ? `Применено ${applied} изменений, ${failed} ошибок` : `Применено ${applied} изменений ✓`));
        break;
      }

      case "version_created":
        store.addVersion({ number: msg.version as number, hash: msg.hash as string, description: msg.description as string, timestamp: Date.now() });
        break;

      case "autofix_start": store.addMessage(createSystemMessage(`Автофикс: ${msg.file} — ${(msg.error as string).slice(0, 100)}`, false)); break;
      case "autofix_success": store.addMessage(createAssistantMessage(`Ошибка исправлена (попытка ${msg.attempts}) ✓`)); break;
      case "autofix_failed": store.addMessage(createAssistantMessage(`Не удалось исправить после ${msg.attempts} попыток.`)); set({ status: "error" }); break;
      case "reloading_preview": store.addMessage(createSystemMessage("Откат версии, перезагрузка превью...", false)); break;
      case "system_error": store.addMessage(createAssistantMessage(`Ошибка: ${msg.error}`)); set({ status: "error" }); break;
      case "generation_aborted": store.addMessage(createSystemMessage("Генерация прервана пользователем", false)); set({ status: "ready" }); break;

      case "project_created": {
        const pName = msg.projectName as string;
        set({ projectName: pName });
        store.addProject({ name: pName, displayName: pName, status: "ready", port: (msg.port as number) ?? null, createdAt: Date.now() });
        break;
      }

      case "iteration_result": break;
      case "autofix_attempt": store.addMessage(createSystemMessage(`Автофикс: попытка ${msg.attempt}/${msg.maxAttempts}`, true)); break;
      case "autofix_block": store.addMessage(createSystemMessage(`Фикс: ${msg.filepath}`, true)); break;
      case "lm_studio_status": set({ lmStudioStatus: msg.status as "connected" | "disconnected" | "checking" }); break;
    }
  },
}));

// ── File fetch helper ────────────────────────────────────
export const fetchProjectFiles = async (agentUrl: string, projectName: string): Promise<void> => {
  const store = useProjectStore.getState();
  try {
    const treeResp = await fetch(`${agentUrl}/api/projects/${projectName}/files`);
    if (treeResp.ok) { const { data } = await treeResp.json(); store.setFileTree(data); }

    const listResp = await fetch(`${agentUrl}/api/projects/${projectName}/all-files`);
    if (listResp.ok) {
      const { data: files } = await listResp.json();
      for (const filePath of files as string[]) {
        const fileResp = await fetch(`${agentUrl}/api/projects/${projectName}/file?path=${encodeURIComponent(filePath)}`);
        if (fileResp.ok) { const { data: fileData } = await fileResp.json(); store.setFileContent(filePath, fileData.content); }
      }
    }
  } catch (err) { console.error("[fetchProjectFiles]", err); }
};
