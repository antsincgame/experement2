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

interface ProjectState {
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

const initialState = {
  projectName: null as string | null,
  projectList: [] as ProjectEntry[],
  status: "idle" as AppStatus,
  plan: null as Record<string, unknown> | null,
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
};

export const useProjectStore = create<ProjectState>()((set, get) => ({
  ...initialState,

  setProjectName: (projectName) => set({ projectName }),
  setStatus: (status) => set({ status }),
  setPlan: (plan) => set({ plan }),

  addMessage: (message) =>
    set((state) => {
      const next = [...state.messages, message];
      // Cap at 200 messages to prevent unbounded growth
      return { messages: next.length > 200 ? next.slice(-200) : next };
    }),

  updateLastAssistantMessage: (content) =>
    set((state) => {
      const msgs = [...state.messages];
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === "assistant") {
          msgs[i] = { ...msgs[i], content, status: "streaming" };
          break;
        }
      }
      return { messages: msgs };
    }),

  setFileTree: (fileTree) => set({ fileTree }),

  openFile: (path) =>
    set((state) => ({
      openFiles: state.openFiles.includes(path)
        ? state.openFiles
        : [...state.openFiles, path],
      activeFile: path,
    })),

  closeFile: (path) =>
    set((state) => {
      const openFiles = state.openFiles.filter((f) => f !== path);
      const activeFile =
        state.activeFile === path
          ? openFiles[openFiles.length - 1] ?? null
          : state.activeFile;
      return { openFiles, activeFile };
    }),

  setActiveFile: (activeFile) => set({ activeFile }),
  setFileContent: (path, content) =>
    set((state) => {
      const updated = { ...state.fileContents, [path]: content };
      const keys = Object.keys(updated);
      // LRU eviction: keep only the 40 most recently set files
      if (keys.length > 40) {
        const evict = keys.slice(0, keys.length - 40);
        for (const k of evict) delete updated[k];
      }
      return { fileContents: updated };
    }),

  addVersion: (version) =>
    set((state) => ({
      versions: [...state.versions, version],
      currentVersion: version.number,
    })),

  setCurrentVersion: (currentVersion) => set({ currentVersion }),

  setPreview: (previewUrl, previewPort) =>
    set({ previewUrl, previewPort }),

  setGenerationProgress: (generationProgress, currentGeneratingFile) =>
    set({ generationProgress, currentGeneratingFile }),

  setConnected: (isConnected) => set({ isConnected }),
  setLmStudioStatus: (lmStudioStatus) => set({ lmStudioStatus }),

  appendStreamingContent: (chunk) =>
    set((state) => {
      const next = state.streamingContent + chunk;
      // Keep only last 12 000 chars to prevent OOM during long streaming
      return { streamingContent: next.length > 12_000 ? next.slice(-12_000) : next };
    }),
  clearStreamingContent: () => set({ streamingContent: "" }),

  toggleFileTree: () =>
    set((state) => ({ fileTreeVisible: !state.fileTreeVisible })),
  toggleTerminal: () =>
    set((state) => ({ terminalVisible: !state.terminalVisible })),

  addProject: (entry) =>
    set((state) => ({
      projectList: [...state.projectList.filter((p) => p.name !== entry.name), entry],
    })),

  removeProject: (name) =>
    set((state) => {
      const newList = state.projectList.filter((p) => p.name !== name);
      const isActive = state.projectName === name;
      return {
        projectList: newList,
        ...(isActive
          ? {
              projectName: newList[0]?.name ?? null,
              status: newList[0]?.status ?? "idle",
              messages: [],
              fileTree: [],
              openFiles: [],
              activeFile: null,
              fileContents: {},
              versions: [],
              streamingContent: "",
            }
          : {}),
      };
    }),

  switchProject: (name) =>
    set(() => ({
      projectName: name,
      messages: [],
      fileTree: [],
      openFiles: [],
      activeFile: null,
      fileContents: {},
      versions: [],
      streamingContent: "",
      status: "ready",
    })),

  reset: () => set(initialState),

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
        store.addMessage(
          createSystemMessage("План приложения создан ✓", false)
        );
        break;

      case "scaffold_complete":
        set({ projectName: msg.projectName as string });
        store.addMessage(
          createSystemMessage("Проект создан из кэша ✓", true)
        );
        break;

      case "file_generating":
        set({
          generationProgress: msg.progress as number,
          currentGeneratingFile: msg.filepath as string,
        });
        break;

      case "code_chunk":
        store.appendStreamingContent(msg.chunk as string);
        break;

      case "file_complete":
        store.addMessage(
          createSystemMessage(`Файл создан: ${msg.filepath}`, true)
        );
        break;

      case "generation_complete":
        store.clearStreamingContent();
        store.addMessage(
          createAssistantMessage(
            `Сгенерировано ${msg.filesCount} файлов ✓`
          )
        );
        break;

      case "build_event":
        break;

      case "preview_ready": {
        set({
          status: "ready",
          previewUrl: msg.proxyUrl as string,
          previewPort: msg.port as number,
        });
        store.addMessage(
          createAssistantMessage("Preview ready! App is running.")
        );
        // Fetch file tree after project is ready
        const pName = get().projectName;
        if (pName) {
          fetchProjectFiles("http://localhost:3100", pName);
        }
        break;
      }

      case "thinking":
        store.addMessage(
          createAssistantMessage(msg.content as string)
        );
        break;

      case "analysis_complete":
        store.addMessage(
          createSystemMessage(
            `Анализ: чтение ${(msg.files as string[]).join(", ")}`,
            true
          )
        );
        break;

      case "block_applied":
        store.addMessage(
          createSystemMessage(
            `Изменён: ${msg.filepath}`,
            true
          )
        );
        break;

      case "iteration_complete": {
        const applied = msg.applied as number;
        const failed = msg.failed as number;
        const text =
          failed > 0
            ? `Применено ${applied} изменений, ${failed} ошибок`
            : `Применено ${applied} изменений ✓`;
        store.addMessage(createAssistantMessage(text));
        break;
      }

      case "version_created":
        store.addVersion({
          number: msg.version as number,
          hash: msg.hash as string,
          description: msg.description as string,
          timestamp: Date.now(),
        });
        break;

      case "autofix_start":
        store.addMessage(
          createSystemMessage(
            `Автофикс: ${msg.file} — ${(msg.error as string).slice(0, 100)}`,
            false
          )
        );
        break;

      case "autofix_success":
        store.addMessage(
          createAssistantMessage(
            `Ошибка исправлена автоматически (попытка ${msg.attempts}) ✓`
          )
        );
        break;

      case "autofix_failed":
        store.addMessage(
          createAssistantMessage(
            `Не удалось исправить после ${msg.attempts} попыток. Опишите проблему подробнее.`
          )
        );
        set({ status: "error" });
        break;

      case "reloading_preview":
        store.addMessage(
          createSystemMessage("Откат версии, перезагрузка превью...", false)
        );
        break;

      case "system_error":
        store.addMessage(
          createAssistantMessage(`Ошибка: ${msg.error}`)
        );
        set({ status: "error" });
        break;

      case "generation_aborted":
        store.addMessage(
          createSystemMessage("Генерация прервана пользователем", false)
        );
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
        // already handled by iteration_complete
        break;

      case "autofix_attempt":
        store.addMessage(
          createSystemMessage(
            `Автофикс: попытка ${msg.attempt}/${msg.maxAttempts}`,
            true
          )
        );
        break;

      case "autofix_block":
        store.addMessage(
          createSystemMessage(`Фикс: ${msg.filepath}`, true)
        );
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
