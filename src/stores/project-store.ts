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

const emptyChat = (): ProjectChat => ({
  messages: [],
  versions: [],
  fileTree: [],
  openFiles: [],
  activeFile: null,
  fileContents: {},
  streamingContent: "",
  previewUrl: null,
  previewPort: null,
});

interface ProjectState {
  // ── Global state ──
  projectName: string | null;
  projectList: ProjectEntry[];
  status: AppStatus;
  plan: Record<string, unknown> | null;
  generationProgress: number;
  currentGeneratingFile: string | null;
  isConnected: boolean;
  lmStudioStatus: "connected" | "disconnected" | "checking";
  fileTreeVisible: boolean;
  terminalVisible: boolean;

  // ── Per-project state map ──
  projectChats: Record<string, ProjectChat>;

  // ── Computed getters (read from active project) ──
  readonly messages: ChatMessage[];
  readonly fileTree: FileNode[];
  readonly openFiles: string[];
  readonly activeFile: string | null;
  readonly fileContents: Record<string, string>;
  readonly versions: Version[];
  readonly currentVersion: number;
  readonly streamingContent: string;
  readonly previewUrl: string | null;
  readonly previewPort: number | null;

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

// ── Helper: get or create chat for a project ──
const getChat = (chats: Record<string, ProjectChat>, name: string | null): ProjectChat => {
  if (!name) return emptyChat();
  return chats[name] ?? emptyChat();
};

const updateChat = (
  chats: Record<string, ProjectChat>,
  name: string | null,
  updater: (chat: ProjectChat) => Partial<ProjectChat>
): Record<string, ProjectChat> => {
  if (!name) return chats;
  const current = chats[name] ?? emptyChat();
  return { ...chats, [name]: { ...current, ...updater(current) } };
};

export const useProjectStore = create<ProjectState>()((set, get) => ({
  // ── Global state ──
  projectName: null,
  projectList: [],
  status: "idle" as AppStatus,
  plan: null,
  generationProgress: 0,
  currentGeneratingFile: null,
  isConnected: false,
  lmStudioStatus: "checking" as "connected" | "disconnected" | "checking",
  fileTreeVisible: true,
  terminalVisible: true,
  projectChats: {} as Record<string, ProjectChat>,

  // ── Computed getters ──
  get messages() { return getChat(get().projectChats, get().projectName).messages; },
  get fileTree() { return getChat(get().projectChats, get().projectName).fileTree; },
  get openFiles() { return getChat(get().projectChats, get().projectName).openFiles; },
  get activeFile() { return getChat(get().projectChats, get().projectName).activeFile; },
  get fileContents() { return getChat(get().projectChats, get().projectName).fileContents; },
  get versions() { return getChat(get().projectChats, get().projectName).versions; },
  get currentVersion() {
    const v = getChat(get().projectChats, get().projectName).versions;
    return v.length > 0 ? v[v.length - 1].number : 0;
  },
  get streamingContent() { return getChat(get().projectChats, get().projectName).streamingContent; },
  get previewUrl() { return getChat(get().projectChats, get().projectName).previewUrl; },
  get previewPort() { return getChat(get().projectChats, get().projectName).previewPort; },

  // ── Actions ──
  setProjectName: (projectName) => set({ projectName }),
  setStatus: (status) => set({ status }),
  setPlan: (plan) => set({ plan }),

  addMessage: (message) =>
    set((state) => {
      const chat = getChat(state.projectChats, state.projectName);
      const next = [...chat.messages, message];
      const messages = next.length > 200 ? next.slice(-200) : next;
      return { projectChats: updateChat(state.projectChats, state.projectName, () => ({ messages })) };
    }),

  updateLastAssistantMessage: (content) =>
    set((state) => {
      const chat = getChat(state.projectChats, state.projectName);
      const msgs = [...chat.messages];
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === "assistant") {
          msgs[i] = { ...msgs[i], content, status: "streaming" };
          break;
        }
      }
      return { projectChats: updateChat(state.projectChats, state.projectName, () => ({ messages: msgs })) };
    }),

  setFileTree: (fileTree) =>
    set((state) => ({
      projectChats: updateChat(state.projectChats, state.projectName, () => ({ fileTree })),
    })),

  openFile: (path) =>
    set((state) => {
      const chat = getChat(state.projectChats, state.projectName);
      const openFiles = chat.openFiles.includes(path) ? chat.openFiles : [...chat.openFiles, path];
      return { projectChats: updateChat(state.projectChats, state.projectName, () => ({ openFiles, activeFile: path })) };
    }),

  closeFile: (path) =>
    set((state) => {
      const chat = getChat(state.projectChats, state.projectName);
      const openFiles = chat.openFiles.filter((f) => f !== path);
      const activeFile = chat.activeFile === path ? (openFiles[openFiles.length - 1] ?? null) : chat.activeFile;
      return { projectChats: updateChat(state.projectChats, state.projectName, () => ({ openFiles, activeFile })) };
    }),

  setActiveFile: (activeFile) =>
    set((state) => ({
      projectChats: updateChat(state.projectChats, state.projectName, () => ({ activeFile })),
    })),

  setFileContent: (path, content) =>
    set((state) => {
      const chat = getChat(state.projectChats, state.projectName);
      const updated = { ...chat.fileContents, [path]: content };
      const keys = Object.keys(updated);
      if (keys.length > 40) {
        const evict = keys.slice(0, keys.length - 40);
        for (const k of evict) delete updated[k];
      }
      return { projectChats: updateChat(state.projectChats, state.projectName, () => ({ fileContents: updated })) };
    }),

  addVersion: (version) =>
    set((state) => {
      const chat = getChat(state.projectChats, state.projectName);
      return { projectChats: updateChat(state.projectChats, state.projectName, () => ({ versions: [...chat.versions, version] })) };
    }),

  setCurrentVersion: () => {
    // Version number is computed from versions array length
  },

  setPreview: (previewUrl, previewPort) =>
    set((state) => ({
      projectChats: updateChat(state.projectChats, state.projectName, () => ({ previewUrl, previewPort })),
    })),

  setGenerationProgress: (generationProgress, currentGeneratingFile) =>
    set({ generationProgress, currentGeneratingFile }),

  setConnected: (isConnected) => set({ isConnected }),
  setLmStudioStatus: (lmStudioStatus) => set({ lmStudioStatus }),

  appendStreamingContent: (chunk) =>
    set((state) => {
      const chat = getChat(state.projectChats, state.projectName);
      const next = chat.streamingContent + chunk;
      const streamingContent = next.length > 12_000 ? next.slice(-12_000) : next;
      return { projectChats: updateChat(state.projectChats, state.projectName, () => ({ streamingContent })) };
    }),

  clearStreamingContent: () =>
    set((state) => ({
      projectChats: updateChat(state.projectChats, state.projectName, () => ({ streamingContent: "" })),
    })),

  toggleFileTree: () => set((state) => ({ fileTreeVisible: !state.fileTreeVisible })),
  toggleTerminal: () => set((state) => ({ terminalVisible: !state.terminalVisible })),

  addProject: (entry) =>
    set((state) => ({
      projectList: [...state.projectList.filter((p) => p.name !== entry.name), entry],
      // Initialize empty chat if new
      projectChats: state.projectChats[entry.name]
        ? state.projectChats
        : { ...state.projectChats, [entry.name]: emptyChat() },
    })),

  removeProject: (name) =>
    set((state) => {
      const newList = state.projectList.filter((p) => p.name !== name);
      const isActive = state.projectName === name;
      const { [name]: _removed, ...restChats } = state.projectChats;
      return {
        projectList: newList,
        projectChats: restChats,
        ...(isActive
          ? { projectName: newList[0]?.name ?? null, status: newList[0]?.status ?? "idle" }
          : {}),
      };
    }),

  switchProject: (name) =>
    set(() => ({
      projectName: name,
      status: "ready",
      // Chat preserved in projectChats[name] — NO clearing!
    })),

  reset: () => set({
    projectName: null,
    projectList: [],
    status: "idle" as AppStatus,
    plan: null,
    generationProgress: 0,
    currentGeneratingFile: null,
    isConnected: false,
    lmStudioStatus: "checking" as "connected" | "disconnected" | "checking",
    fileTreeVisible: true,
    terminalVisible: true,
    projectChats: {},
  }),

  // ── WebSocket message handler ──
  handleWsMessage: (msg) => {
    const type = msg.type as string;
    const store = get();

    switch (type) {
      case "connected":
        set({ isConnected: true });
        break;

      case "status":
        set({ status: msg.status as AppStatus });
        break;

      case "plan_chunk":
        store.appendStreamingContent(msg.chunk as string);
        break;

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

      case "code_chunk":
        store.appendStreamingContent(msg.chunk as string);
        break;

      case "file_complete":
        store.addMessage(createSystemMessage(`Файл создан: ${msg.filepath}`, true));
        break;

      case "generation_complete":
        store.clearStreamingContent();
        store.addMessage(createAssistantMessage(`Сгенерировано ${msg.filesCount} файлов ✓`));
        break;

      case "build_event":
        break;

      case "preview_ready": {
        store.setPreview(msg.proxyUrl as string, msg.port as number);
        set({ status: "ready" });
        store.addMessage(createAssistantMessage("Preview ready! App is running."));
        const pName = get().projectName;
        if (pName) fetchProjectFiles("http://localhost:3100", pName);
        break;
      }

      case "thinking":
        store.addMessage(createAssistantMessage(msg.content as string));
        break;

      case "analysis_complete":
        store.addMessage(createSystemMessage(`Анализ: чтение ${(msg.files as string[]).join(", ")}`, true));
        break;

      case "block_applied":
        store.addMessage(createSystemMessage(`Изменён: ${msg.filepath}`, true));
        break;

      case "iteration_complete": {
        const applied = msg.applied as number;
        const failed = msg.failed as number;
        const text = failed > 0
          ? `Применено ${applied} изменений, ${failed} ошибок`
          : `Применено ${applied} изменений ✓`;
        store.addMessage(createAssistantMessage(text));
        break;
      }

      case "version_created":
        store.addVersion({ number: msg.version as number, hash: msg.hash as string, description: msg.description as string, timestamp: Date.now() });
        break;

      case "autofix_start":
        store.addMessage(createSystemMessage(`Автофикс: ${msg.file} — ${(msg.error as string).slice(0, 100)}`, false));
        break;

      case "autofix_success":
        store.addMessage(createAssistantMessage(`Ошибка исправлена автоматически (попытка ${msg.attempts}) ✓`));
        break;

      case "autofix_failed":
        store.addMessage(createAssistantMessage(`Не удалось исправить после ${msg.attempts} попыток. Опишите проблему подробнее.`));
        set({ status: "error" });
        break;

      case "reloading_preview":
        store.addMessage(createSystemMessage("Откат версии, перезагрузка превью...", false));
        break;

      case "system_error":
        store.addMessage(createAssistantMessage(`Ошибка: ${msg.error}`));
        set({ status: "error" });
        break;

      case "generation_aborted":
        store.addMessage(createSystemMessage("Генерация прервана пользователем", false));
        set({ status: "ready" });
        break;

      case "project_created": {
        const pName = msg.projectName as string;
        set({ projectName: pName });
        store.addProject({
          name: pName,
          displayName: pName,
          status: "ready",
          port: (msg.port as number) ?? null,
          createdAt: Date.now(),
        });
        break;
      }

      case "iteration_result":
        break;

      case "autofix_attempt":
        store.addMessage(createSystemMessage(`Автофикс: попытка ${msg.attempt}/${msg.maxAttempts}`, true));
        break;

      case "autofix_block":
        store.addMessage(createSystemMessage(`Фикс: ${msg.filepath}`, true));
        break;

      case "lm_studio_status":
        set({ lmStudioStatus: msg.status as "connected" | "disconnected" | "checking" });
        break;
    }
  },
}));

// ── File fetch helper ────────────────────────────────────

export const fetchProjectFiles = async (
  agentUrl: string,
  projectName: string
): Promise<void> => {
  const store = useProjectStore.getState();
  try {
    const treeResp = await fetch(`${agentUrl}/api/projects/${projectName}/files`);
    if (treeResp.ok) {
      const { data } = await treeResp.json();
      store.setFileTree(data);
    }

    const listResp = await fetch(`${agentUrl}/api/projects/${projectName}/all-files`);
    if (listResp.ok) {
      const { data: files } = await listResp.json();
      for (const filePath of files as string[]) {
        const fileResp = await fetch(
          `${agentUrl}/api/projects/${projectName}/file?path=${encodeURIComponent(filePath)}`
        );
        if (fileResp.ok) {
          const { data: fileData } = await fileResp.json();
          store.setFileContent(filePath, fileData.content);
        }
      }
    }
  } catch (err) {
    console.error("[fetchProjectFiles]", err);
  }
};
