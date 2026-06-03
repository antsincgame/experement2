// Maps validated WebSocket events onto store actions so project lifecycle and preview runtime stay in sync.
import {
  CREATING_PROJECT_SLUG,
  isCreationSession,
  isPendingCreation,
} from "@/shared/lib/creation-flow";
import {
  createEmptyChat,
  migrateCreatingChatToProject,
} from "@/stores/project-store.helpers";
import {
  createAssistantMessage,
  createReasoningMessage,
  createDiffMessage,
  createSystemMessage,
  createErrorMessage,
  type ChatMessage,
} from "@/features/chat/schemas/message.schema";
import type { IncomingWsMessage } from "@/shared/schemas/ws-messages";
import { useSettingsStore } from "@/stores/settings-store";
import type {
  AppStatus,
  ProjectEntry,
  ProjectStoreGet,
  ProjectStoreSet,
} from "../project-store.types";

type StoreGet = ProjectStoreGet;
type StoreSet = ProjectStoreSet;

const GLOBAL_MESSAGE_TYPES = new Set([
  "connected",
  "lm_studio_status",
  "llm_server_status",
]);

const UNSCOPED_FALLBACK_TYPES = new Set([
  "generation_aborted",
]);

const getMessageProjectName = (msg: IncomingWsMessage): string | null =>
  "projectName" in msg && typeof msg.projectName === "string"
    ? msg.projectName
    : null;

const matchesActiveProject = (
  store: StoreGet,
  msg: IncomingWsMessage
): boolean => {
  if (GLOBAL_MESSAGE_TYPES.has(msg.type)) {
    return true;
  }

  const messageProjectName = getMessageProjectName(msg);
  const state = store();
  const currentProjectName = state.projectName;

  if (isCreationSession(state)) {
    return true;
  }

  if (!currentProjectName) {
    return true;
  }

  if (!messageProjectName) {
    return UNSCOPED_FALLBACK_TYPES.has(msg.type);
  }

  return messageProjectName === currentProjectName;
};

/** Project key for chat cache: explicit WS scope, or creation session slug. */
export const resolveChatTargetProject = (
  get: StoreGet,
  msg: IncomingWsMessage
): string | null => {
  const explicit = getMessageProjectName(msg);
  if (explicit) {
    return explicit;
  }
  const state = get();
  if (isCreationSession(state) && state.projectName) {
    return state.projectName;
  }
  return null;
};

const applyErrorState = (
  store: ReturnType<StoreGet>,
  options: {
    clearPreview?: boolean;
    error?: string | null;
    buildId?: string | null;
  } = {}
): void => {
  if (options.clearPreview !== false) {
    store.setPreview(null, null);
  }
  store.setPreviewStatus("error", {
    error: options.error ?? null,
    buildId: options.buildId ?? null,
  });
  store.setStatus("error");
};

const patchProjectListEntry = (
  set: StoreSet,
  get: StoreGet,
  projectName: string,
  patch: Partial<Pick<ProjectEntry, "status" | "port">>
): void => {
  const state = get();
  if (!state.projectList.some((project) => project.name === projectName)) {
    return;
  }

  set({
    projectList: state.projectList.map((project) =>
      project.name === projectName ? { ...project, ...patch } : project
    ),
  });
};

const applyPreviewStatus = (
  store: ReturnType<StoreGet>,
  previewStatus: "stopped" | "starting" | "ready" | "error",
  options: {
    error?: string | null;
    buildId?: string | null;
    clearPreview?: boolean;
  } = {}
): void => {
  if (options.clearPreview) {
    store.setPreview(null, null);
  }
  store.setPreviewStatus(previewStatus, {
    error: options.error ?? null,
    buildId: options.buildId ?? null,
  });
};

export const createWsHandler = (
  set: StoreSet,
  get: StoreGet,
  fetchProjectFiles: (name: string) => Promise<unknown>,
) => (msg: IncomingWsMessage): void => {
  const { type } = msg;
  const store = get();
  const log = useSettingsStore.getState().addErrorLog;

  const isActive = matchesActiveProject(get, msg);
  const chatProject = resolveChatTargetProject(get, msg);
  // Route a chat message to the active conversation, or — when the event belongs
  // to a project the user has switched away from — silently into that project's
  // cache so its generation/iteration history is not lost.
  const emitChat = (message: ChatMessage): void => {
    if (isActive) {
      store.addMessage(message);
    } else if (chatProject) {
      store.appendBackgroundMessage(chatProject, message);
    }
  };

  switch (type) {
    case "connected":
      set({ isConnected: true });
      log({ level: "info", source: "websocket", message: "Connected to agent" });
      break;

    case "status": {
      const statusProject = getMessageProjectName(msg);
      if (!matchesActiveProject(get, msg)) {
        if (statusProject) {
          patchProjectListEntry(set, get, statusProject, { status: msg.status });
        } else if (get().projectName) {
          log({ level: "warn", source: "ws", message: `Ignored unscoped status event: ${msg.status}` });
        }
        break;
      }
      store.setStatus(msg.status);
      if (msg.status === "planning") {
        store.resetGenerationFiles();
      }
      if (msg.previewStatus) {
        applyPreviewStatus(store, msg.previewStatus, {
          buildId: msg.buildId ?? null,
          clearPreview: msg.previewStatus === "starting" || msg.previewStatus === "error",
        });
      }
      if (msg.status === "error" && msg.previewStatus === "error") {
        applyErrorState(store, {
          clearPreview: true,
          buildId: msg.buildId ?? null,
        });
      }
      log({ level: "info", source: "status", message: `Status → ${msg.status}` });
      break;
    }

    case "plan_chunk": {
      if (!matchesActiveProject(get, msg)) break;
      const planStatus = get().status;
      if (planStatus === "planning" || planStatus === "scaffolding") {
        store.appendStreamingContent(msg.chunk);
      }
      break;
    }

    case "plan_complete": {
      const pending = get().pendingProjectName;
      const plan = msg.plan;
      const planName = typeof plan.name === "string" ? plan.name : null;
      const cacheName = getMessageProjectName(msg) ?? planName;
      const displayName =
        typeof plan.displayName === "string" ? plan.displayName : planName;

      if (!isActive && cacheName) {
        const current = get();
        let projectChats = current.projectChats;
        const creatingEntry = projectChats[CREATING_PROJECT_SLUG];
        if (creatingEntry && planName) {
          projectChats = migrateCreatingChatToProject(projectChats, planName, {
            ...current,
            messages: creatingEntry.messages,
            streamingContent: creatingEntry.streamingContent,
          });
        }
        set({ projectChats });
        store.appendBackgroundMessage(
          cacheName,
          createSystemMessage("Plan created [ok]", false)
        );
        if (planName) {
          const existing = store.projectList.find((p) => p.name === planName);
          store.addProject({
            name: planName,
            displayName: displayName ?? planName,
            status: existing?.status ?? current.status ?? "generating",
            port: existing?.port ?? null,
            createdAt: existing?.createdAt ?? Date.now(),
          });
        }
        log({
          level: "info",
          source: "pipeline",
          message: `Plan complete (background): ${cacheName}`,
        });
        break;
      }

      if (!matchesActiveProject(get, msg)) break;

      if (isPendingCreation(pending) && planName) {
        const current = get();
        const projectChats = migrateCreatingChatToProject(
          current.projectChats,
          planName,
          current
        );
        const nextChat = projectChats[planName] ?? createEmptyChat();
        set({
          plan,
          projectName: planName,
          projectChats,
          messages: nextChat.messages,
          streamingContent: nextChat.streamingContent,
        });
        store.addProject({
          name: planName,
          displayName: displayName ?? planName,
          status: current.status,
          port: null,
          createdAt: Date.now(),
        });
      } else {
        set({ plan: msg.plan });
      }

      store.clearStreamingContent();
      emitChat(createSystemMessage("Plan created [ok]", false));
      log({ level: "info", source: "pipeline", message: "Plan complete" });
      break;
    }

    case "scaffold_complete": {
      const projectName = msg.projectName;
      const pending = get().pendingProjectName;
      // Only switch if user is actively creating (pending creation accepts any, or exact match)
      if (pending && !isPendingCreation(pending) && pending !== projectName) {
        log({ level: "warn", source: "pipeline", message: `Ignoring scaffold_complete for ${projectName} (pending: ${pending})` });
        break;
      }
      const existing = store.projectList.find((p) => p.name === projectName);
      const entryStatus: AppStatus = existing?.status ?? store.status ?? "generating";
      store.addProject({
        name: projectName,
        displayName: existing?.displayName ?? projectName,
        status: entryStatus,
        port: existing?.port ?? null,
        createdAt: existing?.createdAt ?? Date.now(),
      });

      if (!pending && !isActive) {
        log({
          level: "info",
          source: "pipeline",
          message: `Scaffold complete (background): ${projectName}`,
        });
        break;
      }

      set({ projectName, pendingProjectName: null });
      store.addMessage(createSystemMessage("Project scaffolded from cache [ok]", true));
      log({ level: "info", source: "pipeline", message: `Scaffold complete: ${projectName}` });
      void fetchProjectFiles(projectName);
      break;
    }

    case "file_generating":
      if (!matchesActiveProject(get, msg)) break;
      set({
        generationProgress: msg.progress,
        currentGeneratingFile: msg.filepath,
      });
      store.startGenerationFile(msg.filepath);
      break;

    case "code_chunk": {
      if (!matchesActiveProject(get, msg)) break;
      const codeStatus = get().status;
      if (codeStatus === "generating" || codeStatus === "analyzing") {
        store.appendStreamingContent(msg.chunk);
        store.appendGenerationCode(msg.chunk);
      }
      break;
    }

    case "file_complete":
      if (isActive) store.completeGenerationFile(msg.filepath);
      emitChat(createSystemMessage(`File created: ${msg.filepath}`, true));
      log({ level: "info", source: "generator", message: `File: ${msg.filepath}` });
      break;

    case "generation_complete":
      if (isActive) store.clearStreamingContent();
      emitChat(createAssistantMessage(`Generated ${msg.filesCount} files [ok]`));
      log({ level: "info", source: "generator", message: `Generated ${msg.filesCount} files` });
      break;

    case "build_event": {
      if (!matchesActiveProject(get, msg)) {
        if (get().projectName && !getMessageProjectName(msg)) {
          log({ level: "warn", source: "ws", message: `Ignored unscoped build event: ${msg.eventType}` });
        }
        break;
      }
      const eventType = msg.eventType;
      if (eventType === "build_error") {
        log({ level: "error", source: "metro", message: "Build error", details: msg.error?.slice(0, 500) });
      } else if (eventType === "build_success") {
        log({ level: "info", source: "metro", message: "Build success" });
      } else {
        log({ level: "info", source: "metro", message: msg.message || eventType });
      }
      break;
    }

    case "preview_status":
      if (isActive) {
        applyPreviewStatus(store, msg.previewStatus, {
          buildId: msg.buildId,
          error: msg.error,
          clearPreview: msg.previewStatus === "starting" || msg.previewStatus === "error" || msg.previewStatus === "stopped",
        });
      }
      if (msg.previewStatus === "error") {
        emitChat(createErrorMessage("Preview failed to start.", msg.error));
        log({
          level: "error",
          source: "preview",
          message: "Preview failed",
          details: msg.error,
        });
      } else if (msg.previewStatus === "starting" && isActive) {
        log({ level: "info", source: "preview", message: "Preview starting" });
      }
      break;

    case "preview_ready": {
      if (!matchesActiveProject(get, msg)) {
        patchProjectListEntry(set, get, msg.projectName, {
          status: "ready",
          port: msg.port,
        });
        break;
      }
      const currentProject = get().projectName;
      if (msg.projectName === currentProject) {
        const prevPort = get().previewPort;
        store.setPreview(msg.proxyUrl, msg.port);
        store.setPreviewStatus("ready", {
          buildId: msg.buildId,
          error: null,
        });
        store.setStatus("ready");
        if (prevPort !== msg.port) {
          store.addMessage(createAssistantMessage(`Preview started on port ${msg.port}.`));
        }
        if (currentProject) {
          void fetchProjectFiles(currentProject);
        }
      }
      log({ level: "info", source: "preview", message: `Preview: ${msg.projectName} → port ${msg.port}` });
      break;
    }

    case "thinking":
      emitChat(createReasoningMessage(msg.content));
      break;

    case "analysis_complete": {
      const thinking = msg.thinking;
      if (thinking) emitChat(createReasoningMessage(thinking));
      const { files } = msg;
      if (files?.length) emitChat(createSystemMessage(`Analyzing: ${files.join(", ")}`, true));
      break;
    }

    case "file_diff": {
      const { filepath, before, after } = msg;
      emitChat(createDiffMessage(filepath, before, after));
      if (isActive) store.setFileContent(filepath, after);
      break;
    }

    case "block_applied":
      if (!matchesActiveProject(get, msg)) {
        break;
      }
      log({ level: "info", source: "editor", message: `Block applied: ${msg.filepath}` });
      break;

    case "iteration_result": {
      const applied = msg.appliedBlocks ?? 0;
      const failed = msg.failedBlocks ?? 0;
      const errors = msg.errors ?? [];
      const resultProject = getMessageProjectName(msg);
      if (!isActive && resultProject) {
        const terminalStatus: AppStatus =
          failed > 0 || errors.length > 0 ? "error" : "ready";
        patchProjectListEntry(set, get, resultProject, { status: terminalStatus });
      }
      if (applied > 0 && failed === 0 && errors.length === 0) {
        emitChat(createAssistantMessage(`Applied ${applied} changes [ok]`));
      } else if (failed > 0 || errors.length > 0) {
        const failureCount = Math.max(failed, errors.length, 1);
        emitChat(createErrorMessage(
          `Applied ${applied} changes, ${failureCount} errors`,
          errors.join("\n") || undefined
        ));
      }
      break;
    }

    case "iteration_complete": {
      const { applied, failed } = msg;
      const errors = msg.errors ?? [];
      const hasFailure = failed > 0 || errors.length > 0;
      const iterationProject = getMessageProjectName(msg);
      if (!isActive && iterationProject) {
        patchProjectListEntry(set, get, iterationProject, {
          status: hasFailure ? "error" : "ready",
        });
      }
      if (hasFailure) {
        const failureCount = Math.max(failed, errors.length, 1);
        emitChat(createErrorMessage(`Applied ${applied} changes, ${failureCount} errors`, errors.join("\n") || undefined));
        log({ level: "error", source: "iteration", message: `${failureCount} blocks failed`, details: errors.join("\n") });
        if (isActive) {
          applyErrorState(store, {
            error: errors.join("\n") || "Iteration failed",
          });
        }
      } else if (isActive) {
        store.setStatus("ready");
        if (get().previewStatus === "starting") {
          store.setPreviewStatus("stopped", { buildId: get().previewBuildId });
        }
      }
      if (applied > 0 && !hasFailure) {
        emitChat(createAssistantMessage(`Applied ${applied} changes [ok]`));
        if (isActive) store.setStatus("ready");
      }
      break;
    }

    case "version_created":
      if (!matchesActiveProject(get, msg)) {
        break;
      }
      store.addVersion({ number: msg.version, hash: msg.hash, description: msg.description, timestamp: Date.now() });
      log({ level: "info", source: "git", message: `Version v${msg.version} committed`, details: `Hash: ${msg.hash.slice(0, 8)}` });
      break;

    case "autofix_start":
      emitChat(createSystemMessage(`Autofix: ${msg.file ?? "unknown"} - ${msg.error.slice(0, 100)}`, false));
      log({ level: "warn", source: "autofix", message: `Starting autofix: ${msg.file ?? "unknown"}`, details: msg.error.slice(0, 300) });
      break;

    case "autofix_success":
      emitChat(createAssistantMessage(`Error fixed (attempt ${msg.attempts}) [ok]`));
      log({ level: "info", source: "autofix", message: `Fixed on attempt ${msg.attempts}` });
      break;

    case "autofix_failed":
      emitChat(createErrorMessage(`Could not fix after ${msg.attempts} attempts.`, msg.error, msg.file));
      log({ level: "error", source: "autofix", message: `Autofix failed after ${msg.attempts} attempts`, details: `File: ${msg.file ?? "unknown"}\n${msg.error ?? ""}` });
      if (isActive) {
        applyErrorState(store, {
          error: msg.error ?? "Autofix failed",
          buildId: msg.buildId ?? null,
        });
      }
      break;

    case "reloading_preview":
      emitChat(createSystemMessage("Reverting version, reloading preview...", false));
      break;

    case "system_error":
      emitChat(createErrorMessage(`Error: ${msg.error}`, msg.error, msg.file));
      log({ level: "error", source: "system", message: String(msg.error), details: msg.file ? `File: ${msg.file}` : undefined });
      if (isActive) {
        applyErrorState(store, {
          error: msg.error,
          buildId: msg.buildId ?? null,
        });
      }
      break;

    case "generation_aborted":
      emitChat(createSystemMessage("Generation aborted by user", false));
      if (isActive) {
        store.setStatus("ready");
        applyPreviewStatus(store, "stopped", { clearPreview: true });
      }
      log({ level: "warn", source: "pipeline", message: "Generation aborted by user" });
      break;

    case "project_created": {
      const pName = msg.projectName;
      if (!pName) {
        log({ level: "warn", source: "pipeline", message: "Received project_created without projectName" });
        break;
      }
      const existing = store.projectList.find((p) => p.name === pName);
      set({ projectName: pName });
      store.addProject({
        name: pName,
        displayName: existing?.displayName ?? pName,
        status: existing?.status ?? store.status ?? "ready",
        port: msg.port ?? existing?.port ?? null,
        createdAt: existing?.createdAt ?? Date.now(),
      });
      log({ level: "info", source: "pipeline", message: `Project created: ${pName}`, details: `Port: ${msg.port ?? "none"}` });
      break;
    }

    case "autofix_attempt":
      emitChat(createSystemMessage(`Autofix: attempt ${msg.attempt}/${msg.maxAttempts}`, true));
      log({ level: "warn", source: "autofix", message: `Attempt ${msg.attempt}/${msg.maxAttempts}` });
      break;

    case "autofix_block":
      emitChat(createSystemMessage(`Fix: ${msg.filepath}`, true));
      log({ level: "info", source: "autofix", message: `Fix applied: ${msg.filepath}` });
      break;

    case "lm_studio_status":
    case "llm_server_status": {
      const lmStatus = msg.status;
      set({ lmStudioStatus: lmStatus });
      if (lmStatus === "disconnected") log({ level: "error", source: "llm-server", message: "LLM server disconnected" });
      else if (lmStatus === "connected") log({ level: "info", source: "llm-server", message: "LLM server connected" });
      break;
    }

    default:
      log({ level: "info", source: "ws", message: `Event: ${type}` });
      break;
  }
};
