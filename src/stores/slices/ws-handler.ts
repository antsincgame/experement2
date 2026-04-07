// Maps validated WebSocket events onto store actions so project lifecycle and preview runtime stay in sync.
import {
  createAssistantMessage,
  createSystemMessage,
  createErrorMessage,
} from "@/features/chat/schemas/message.schema";
import type { IncomingWsMessage } from "@/shared/schemas/ws-messages";
import { useSettingsStore } from "@/stores/settings-store";
import type {
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
  const currentProjectName = store().projectName;

  if (!currentProjectName) {
    return true;
  }

  if (!messageProjectName) {
    return UNSCOPED_FALLBACK_TYPES.has(msg.type);
  }

  return messageProjectName === currentProjectName;
};

const applyErrorState = (
  store: ReturnType<StoreGet>,
  options: {
    clearPreview?: boolean;
    error?: string | null;
    buildId?: string | null;
  } = {}
): void => {
  if (options.clearPreview ?? true) {
    store.setPreview(null, null);
  }
  store.setPreviewStatus("error", {
    error: options.error ?? null,
    buildId: options.buildId ?? null,
  });
  store.setStatus("error");
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

  switch (type) {
    case "connected":
      set({ isConnected: true });
      log({ level: "info", source: "websocket", message: "Connected to agent" });
      break;

    case "status":
      if (!matchesActiveProject(get, msg)) {
        if (get().projectName && !getMessageProjectName(msg)) {
          log({ level: "warn", source: "ws", message: `Ignored unscoped status event: ${msg.status}` });
        }
        break;
      }
      store.setStatus(msg.status);
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

    case "plan_chunk": {
      if (!matchesActiveProject(get, msg)) break;
      const planStatus = get().status;
      if (planStatus === "planning" || planStatus === "scaffolding") {
        store.appendStreamingContent(msg.chunk);
      }
      break;
    }

    case "plan_complete":
      if (!matchesActiveProject(get, msg)) break;
      set({ plan: msg.plan });
      store.clearStreamingContent();
      store.addMessage(createSystemMessage("Plan created [ok]", false));
      log({ level: "info", source: "pipeline", message: "Plan complete" });
      break;

    case "scaffold_complete": {
      const projectName = msg.projectName;
      const pending = get().pendingProjectName;
      // Only switch if user is actively creating (pending="__creating__" accepts any, or exact match)
      if (pending && pending !== "__creating__" && pending !== projectName) {
        log({ level: "warn", source: "pipeline", message: `Ignoring scaffold_complete for ${projectName} (pending: ${pending})` });
        break;
      }
      const existing = store.projectList.find((p) => p.name === projectName);
      set({ projectName, pendingProjectName: null });
      store.addProject({
        name: projectName,
        displayName: existing?.displayName ?? projectName,
        status: existing?.status ?? store.status ?? "generating",
        port: existing?.port ?? null,
        createdAt: existing?.createdAt ?? Date.now(),
      });
      store.addMessage(createSystemMessage("Project scaffolded from cache [ok]", true));
      log({ level: "info", source: "pipeline", message: `Scaffold complete: ${projectName}` });
      break;
    }

    case "file_generating":
      if (!matchesActiveProject(get, msg)) break;
      set({
        generationProgress: msg.progress,
        currentGeneratingFile: msg.filepath,
      });
      break;

    case "code_chunk": {
      if (!matchesActiveProject(get, msg)) break;
      const codeStatus = get().status;
      if (codeStatus === "generating" || codeStatus === "analyzing") {
        store.appendStreamingContent(msg.chunk);
      }
      break;
    }

    case "file_complete":
      if (!matchesActiveProject(get, msg)) break;
      store.addMessage(createSystemMessage(`File created: ${msg.filepath}`, true));
      log({ level: "info", source: "generator", message: `File: ${msg.filepath}` });
      break;

    case "generation_complete":
      if (!matchesActiveProject(get, msg)) break;
      store.clearStreamingContent();
      store.addMessage(createAssistantMessage(`Generated ${msg.filesCount} files [ok]`));
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
      if (!matchesActiveProject(get, msg)) {
        break;
      }
      applyPreviewStatus(store, msg.previewStatus, {
        buildId: msg.buildId,
        error: msg.error,
        clearPreview: msg.previewStatus === "starting" || msg.previewStatus === "error" || msg.previewStatus === "stopped",
      });
      if (msg.previewStatus === "error") {
        store.addMessage(createErrorMessage("Preview failed to start.", msg.error));
        log({
          level: "error",
          source: "preview",
          message: "Preview failed",
          details: msg.error,
        });
      } else if (msg.previewStatus === "starting") {
        log({ level: "info", source: "preview", message: "Preview starting" });
      }
      break;

    case "preview_ready": {
      if (!matchesActiveProject(get, msg)) {
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
      if (!matchesActiveProject(get, msg)) {
        break;
      }
      store.addMessage(createAssistantMessage(msg.content));
      break;

    case "analysis_complete": {
      if (!matchesActiveProject(get, msg)) {
        break;
      }
      const thinking = msg.thinking;
      if (thinking) store.addMessage(createAssistantMessage(thinking));
      const { files } = msg;
      if (files?.length) store.addMessage(createSystemMessage(`Analyzing: ${files.join(", ")}`, true));
      break;
    }

    case "file_diff": {
      if (!matchesActiveProject(get, msg)) {
        break;
      }
      const { filepath, before, after } = msg;
      // Show compact diff in chat
      const addedLines = after.split("\n").length - before.split("\n").length;
      const sign = addedLines >= 0 ? "+" : "";
      store.addMessage(createSystemMessage(
        `📝 ${filepath} (${sign}${addedLines} lines)`,
        false,
      ));
      break;
    }

    case "block_applied":
      if (!matchesActiveProject(get, msg)) {
        break;
      }
      log({ level: "info", source: "editor", message: `Block applied: ${msg.filepath}` });
      break;

    case "iteration_complete": {
      if (!matchesActiveProject(get, msg)) {
        break;
      }
      const { applied, failed } = msg;
      const errors = msg.errors ?? [];
      const hasFailure = failed > 0 || errors.length > 0;
      if (hasFailure) {
        const failureCount = Math.max(failed, errors.length, 1);
        store.addMessage(createErrorMessage(`Applied ${applied} changes, ${failureCount} errors`, errors.join("\n") || undefined));
        log({ level: "error", source: "iteration", message: `${failureCount} blocks failed`, details: errors.join("\n") });
        applyErrorState(store, {
          error: errors.join("\n") || "Iteration failed",
        });
      } else {
        store.setStatus("ready");
        if (get().previewStatus === "starting") {
          store.setPreviewStatus("stopped", { buildId: get().previewBuildId });
        }
      }
      if (applied > 0 && !hasFailure) {
        store.addMessage(createAssistantMessage(`Applied ${applied} changes [ok]`));
        store.setStatus("ready");
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
      if (!matchesActiveProject(get, msg)) {
        break;
      }
      store.addMessage(createSystemMessage(`Autofix: ${msg.file ?? "unknown"} - ${msg.error.slice(0, 100)}`, false));
      log({ level: "warn", source: "autofix", message: `Starting autofix: ${msg.file ?? "unknown"}`, details: msg.error.slice(0, 300) });
      break;

    case "autofix_success":
      if (!matchesActiveProject(get, msg)) {
        break;
      }
      store.addMessage(createAssistantMessage(`Error fixed (attempt ${msg.attempts}) [ok]`));
      log({ level: "info", source: "autofix", message: `Fixed on attempt ${msg.attempts}` });
      break;

    case "autofix_failed":
      if (!matchesActiveProject(get, msg)) {
        break;
      }
      store.addMessage(createErrorMessage(`Could not fix after ${msg.attempts} attempts.`, msg.error, msg.file));
      log({ level: "error", source: "autofix", message: `Autofix failed after ${msg.attempts} attempts`, details: `File: ${msg.file ?? "unknown"}\n${msg.error ?? ""}` });
      applyErrorState(store, {
        error: msg.error ?? "Autofix failed",
        buildId: msg.buildId ?? null,
      });
      break;

    case "reloading_preview":
      if (!matchesActiveProject(get, msg)) {
        break;
      }
      store.addMessage(createSystemMessage("Reverting version, reloading preview...", false));
      break;

    case "system_error":
      if (!matchesActiveProject(get, msg)) {
        break;
      }
      store.addMessage(createErrorMessage(`Error: ${msg.error}`, msg.error, msg.file));
      log({ level: "error", source: "system", message: String(msg.error), details: msg.file ? `File: ${msg.file}` : undefined });
      applyErrorState(store, {
        error: msg.error,
        buildId: msg.buildId ?? null,
      });
      break;

    case "generation_aborted":
      if (!matchesActiveProject(get, msg)) {
        break;
      }
      store.addMessage(createSystemMessage("Generation aborted by user", false));
      store.setStatus("ready");
      applyPreviewStatus(store, "stopped", { clearPreview: true });
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
      if (!matchesActiveProject(get, msg)) {
        break;
      }
      store.addMessage(createSystemMessage(`Autofix: attempt ${msg.attempt}/${msg.maxAttempts}`, true));
      log({ level: "warn", source: "autofix", message: `Attempt ${msg.attempt}/${msg.maxAttempts}` });
      break;

    case "autofix_block":
      if (!matchesActiveProject(get, msg)) {
        break;
      }
      store.addMessage(createSystemMessage(`Fix: ${msg.filepath}`, true));
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
