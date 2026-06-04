// Maps validated WebSocket events onto store actions so project lifecycle and preview runtime stay in sync.
import {
  CREATING_PROJECT_SLUG,
  getPlannedProjectSlug,
  isPendingCreation,
} from "@/shared/lib/creation-flow";
import {
  getMessageProjectName,
  getMessageRequestId,
  matchesActiveProject,
  resolveChatTargetProject,
  resolveEventProject,
} from "./ws-scope.js";
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
  createProcessMessage,
  type ChatMessage,
} from "@/features/chat/schemas/message.schema";
import { formatBuildEventLine } from "@/shared/lib/format-build-event";
import { GENERATION_STATUS_LABELS } from "@/shared/lib/generation-status";
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
  const eventProject = resolveEventProject(get, msg);
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
          // Mirror phase transitions into the background project's chat cache so
          // returning to it shows a complete timeline, not just the final state.
          const phaseLabel = GENERATION_STATUS_LABELS[msg.status];
          if (phaseLabel) {
            store.appendBackgroundMessage(statusProject, createProcessMessage("phase", phaseLabel));
          }
        } else if (get().projectName) {
          log({ level: "warn", source: "ws", message: `Ignored unscoped status event: ${msg.status}` });
        }
        break;
      }
      const previousStatus = get().status;
      store.setStatus(msg.status);
      if (previousStatus !== msg.status) {
        const phaseLabel = GENERATION_STATUS_LABELS[msg.status];
        if (phaseLabel) {
          emitChat(createProcessMessage("phase", phaseLabel));
        }
      }
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
      const target = eventProject;
      if (!target) {
        break;
      }
      if (!isActive) {
        store.appendPlanStreamChunk(msg.chunk, target);
        break;
      }
      const planStatus = get().status;
      if (planStatus === "planning" || planStatus === "scaffolding") {
        store.appendPlanStreamChunk(msg.chunk);
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
        store.syncProjectWorkspace(planName, { plan });
        store.addProject({
          name: planName,
          displayName: displayName ?? planName,
          status: current.status,
          port: null,
          createdAt: Date.now(),
        });
      } else {
        set({ plan: msg.plan });
        if (eventProject) {
          store.syncProjectWorkspace(eventProject, { plan: msg.plan });
        }
      }

      store.finalizePlanStream();
      store.clearStreamingContent();
      const plannedFileCount = Array.isArray(plan.files) ? plan.files.length : "?";
      emitChat(createProcessMessage(
        "phase",
        `Plan locked — **${displayName ?? planName ?? "project"}** (${plannedFileCount} files). Scaffolding…`,
      ));
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
      if (isPendingCreation(pending)) {
        const planned = getPlannedProjectSlug(get().plan);
        if (!planned) {
          log({
            level: "warn",
            source: "pipeline",
            message: `Ignoring scaffold_complete for ${projectName} (plan not ready)`,
          });
          break;
        }
        if (projectName !== planned) {
          log({
            level: "warn",
            source: "pipeline",
            message: `Ignoring scaffold_complete for ${projectName} (planned: ${planned})`,
          });
          break;
        }
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

      set({ projectName, pendingProjectName: null, pendingCreationRequestId: null });
      emitChat(createProcessMessage("phase", `Scaffold ready — \`${projectName}\``));
      log({ level: "info", source: "pipeline", message: `Scaffold complete: ${projectName}` });
      void fetchProjectFiles(projectName);
      break;
    }

    case "file_generating": {
      const target = eventProject;
      if (!target) {
        break;
      }
      if (isActive) {
        set({
          generationProgress: msg.progress,
          currentGeneratingFile: msg.filepath,
        });
        store.startGenerationFile(msg.filepath);
      } else {
        store.syncProjectWorkspace(target, {
          generationProgress: msg.progress,
          currentGeneratingFile: msg.filepath,
        });
        store.startGenerationFile(msg.filepath, target);
      }
      emitChat(createProcessMessage(
        "file",
        `Writing \`${msg.filepath}\` (${Math.round(msg.progress * 100)}%)`,
      ));
      break;
    }

    case "code_chunk": {
      const target = eventProject;
      if (!target) {
        break;
      }
      const codeStatus = isActive
        ? get().status
        : get().projectList.find((p) => p.name === target)?.status ?? "idle";
      if (codeStatus === "generating" || codeStatus === "analyzing") {
        if (isActive) {
          store.appendStreamingContent(msg.chunk);
          store.appendGenerationCode(msg.chunk);
        } else {
          store.appendGenerationCode(msg.chunk, target);
        }
      }
      break;
    }

    case "file_complete":
      if (eventProject) {
        store.completeGenerationFile(msg.filepath, eventProject);
        // Update the existing "Writing..." message to "✓" in-place instead of appending a new one.
        store.completeFileMessage(msg.filepath, eventProject);
      }
      log({ level: "info", source: "generator", message: `File: ${msg.filepath}` });
      break;

    case "generation_complete":
      if (isActive) store.clearStreamingContent();
      emitChat(createAssistantMessage(
        `Done — wrote ${msg.filesCount} files. Spinning up the live preview now…`
      ));
      log({ level: "info", source: "generator", message: `Generated ${msg.filesCount} files` });
      break;

    case "build_event": {
      if (!eventProject && get().projectName && !getMessageProjectName(msg)) {
        log({ level: "warn", source: "ws", message: `Ignored unscoped build event: ${msg.eventType}` });
        break;
      }
      if (!isActive && !eventProject) {
        break;
      }
      const eventType = msg.eventType;
      // Raw Metro stdout (`build_log`) arrives line-by-line and would flood the chat.
      // Keep it in the diagnostic log, but only surface meaningful milestones to chat
      // (model swaps, self-healing, RAG, and the build verdict) — "quiet success".
      if (eventType !== "build_log") {
        const line = formatBuildEventLine(eventType, msg.message, msg.error);
        const processKind = eventType === "moe_swap" ? "moe" : "build";
        emitChat(createProcessMessage(processKind, line));
      }
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

    case "thinking": {
      const target = eventProject;
      if (isActive) {
        store.appendReasoningMessage(msg.content);
      } else if (target) {
        store.appendReasoningMessage(msg.content, target);
      }
      break;
    }

    case "analysis_complete": {
      const thinking = msg.thinking;
      if (thinking) emitChat(createReasoningMessage(thinking));
      const { files } = msg;
      if (files?.length) {
        emitChat(createProcessMessage("phase", `Iteration scope: ${files.join(", ")}`));
      }
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

    case "polish_progress":
      if (!matchesActiveProject(get, msg)) {
        break;
      }
      emitChat(createSystemMessage(`✨ Polishing design (pass ${msg.pass}/${msg.maxPasses})…`, false));
      log({ level: "info", source: "polish", message: `Polish pass ${msg.pass}/${msg.maxPasses}`, details: msg.message });
      break;

    case "autofix_start":
      emitChat(createProcessMessage(
        "fix",
        `Autofix \`${msg.file ?? "project"}\`: ${msg.error.slice(0, 200)}`,
      ));
      log({ level: "warn", source: "autofix", message: `Starting autofix: ${msg.file ?? "unknown"}`, details: msg.error.slice(0, 300) });
      break;

    case "autofix_success":
      emitChat(createProcessMessage("fix", `✓ Fixed after ${msg.attempts} attempt(s)`));
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
      const creationState = get();
      if (isPendingCreation(creationState.pendingProjectName)) {
        // Drop a different run's project_created (different requestId).
        const creationRequestId = creationState.pendingCreationRequestId;
        const messageRequestId = getMessageRequestId(msg);
        if (creationRequestId && messageRequestId && messageRequestId !== creationRequestId) {
          log({
            level: "warn",
            source: "pipeline",
            message: `Ignoring project_created for ${pName} (foreign requestId)`,
          });
          break;
        }
        // Our own project_created always arrives after plan_complete, so the plan
        // must already name the project. If it doesn't yet, this isn't ours.
        const planned = getPlannedProjectSlug(creationState.plan);
        if (!planned || pName !== planned) {
          log({
            level: "warn",
            source: "pipeline",
            message: `Ignoring project_created for ${pName} (planned: ${planned ?? "none"})`,
          });
          break;
        }
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
      emitChat(createProcessMessage(
        "fix",
        `Autofix attempt ${msg.attempt}/${msg.maxAttempts}`,
      ));
      log({ level: "warn", source: "autofix", message: `Attempt ${msg.attempt}/${msg.maxAttempts}` });
      break;

    case "autofix_block":
      emitChat(createProcessMessage("fix", `Patch applied: \`${msg.filepath}\``));
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
