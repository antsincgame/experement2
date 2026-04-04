// Extracted WebSocket message handler — maps WS events to store actions.
import type { StoreApi } from "zustand";
import {
  createAssistantMessage,
  createSystemMessage,
  createErrorMessage,
} from "@/features/chat/schemas/message.schema";
import { useSettingsStore } from "@/stores/settings-store";
import type { AppStatus } from "../project-store";

type StoreGet = () => {
  projectName: string | null;
  projectList: Array<{ name: string; displayName?: string; status?: string; port?: number | null; createdAt?: number }>;
  previewPort: number | null;
  status: AppStatus;
  setStatus: (s: AppStatus) => void;
  addMessage: (m: ReturnType<typeof createAssistantMessage>) => void;
  addProject: (e: { name: string; displayName: string; status: AppStatus; port: number | null; createdAt: number }) => void;
  addVersion: (v: { number: number; hash: string; description: string; timestamp: number }) => void;
  setPreview: (url: string | null, port: number | null) => void;
  setGenerationProgress: (p: number, f: string | null) => void;
  appendStreamingContent: (c: string) => void;
  clearStreamingContent: () => void;
};

type StoreSet = StoreApi<Record<string, unknown>>["setState"];

export const createWsHandler = (
  set: StoreSet,
  get: StoreGet,
  fetchProjectFiles: (name: string) => Promise<void>,
) => (msg: Record<string, unknown>): void => {
  const type = msg.type as string;
  const store = get();
  const log = useSettingsStore.getState().addErrorLog;

  switch (type) {
    case "connected":
      set({ isConnected: true });
      log({ level: "info", source: "websocket", message: "Connected to agent" });
      break;

    case "status":
      store.setStatus(msg.status as AppStatus);
      log({ level: "info", source: "status", message: `Status → ${msg.status}` });
      break;

    case "plan_chunk": {
      // Only append if we're actively planning (not viewing another project)
      const planStatus = get().status;
      if (planStatus === "planning" || planStatus === "scaffolding") {
        store.appendStreamingContent(msg.chunk as string);
      }
      break;
    }

    case "plan_complete":
      set({ plan: msg.plan as Record<string, unknown> });
      store.clearStreamingContent();
      store.addMessage(createSystemMessage("Plan created [ok]", false));
      log({ level: "info", source: "pipeline", message: "Plan complete" });
      break;

    case "scaffold_complete": {
      const projectName = msg.projectName as string;
      const pending = (get() as { pendingProjectName?: string | null }).pendingProjectName;
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
        status: (existing?.status as AppStatus) ?? store.status ?? "generating",
        port: existing?.port ?? null,
        createdAt: existing?.createdAt ?? Date.now(),
      });
      store.addMessage(createSystemMessage("Project scaffolded from cache [ok]", true));
      log({ level: "info", source: "pipeline", message: `Scaffold complete: ${projectName}` });
      break;
    }

    case "file_generating":
      set({
        generationProgress: msg.progress as number,
        currentGeneratingFile: msg.filepath as string,
      });
      break;

    case "code_chunk": {
      const codeStatus = get().status;
      if (codeStatus === "generating" || codeStatus === "analyzing") {
        store.appendStreamingContent(msg.chunk as string);
      }
      break;
    }

    case "file_complete":
      store.addMessage(createSystemMessage(`File created: ${msg.filepath}`, true));
      log({ level: "info", source: "generator", message: `File: ${msg.filepath}` });
      break;

    case "generation_complete":
      store.clearStreamingContent();
      store.addMessage(createAssistantMessage(`Generated ${msg.filesCount} files [ok]`));
      log({ level: "info", source: "generator", message: `Generated ${msg.filesCount} files` });
      break;

    case "build_event": {
      const eventType = msg.eventType as string;
      if (eventType === "build_error") {
        log({ level: "error", source: "metro", message: "Build error", details: (msg.error as string)?.slice(0, 500) });
      } else if (eventType === "build_success") {
        log({ level: "info", source: "metro", message: "Build success" });
      } else {
        log({ level: "info", source: "metro", message: (msg.message as string) || eventType });
      }
      break;
    }

    case "preview_ready": {
      const previewProject = msg.projectName as string | undefined;
      const currentProject = get().projectName;
      if (!previewProject || previewProject === currentProject) {
        const prevPort = get().previewPort;
        store.setPreview(msg.proxyUrl as string, msg.port as number);
        store.setStatus("ready");
        if (prevPort !== (msg.port as number)) {
          store.addMessage(createAssistantMessage(`Preview started on port ${msg.port}.`));
        }
        if (currentProject) {
          void fetchProjectFiles(currentProject);
        }
      }
      log({ level: "info", source: "preview", message: `Preview: ${previewProject ?? "unknown"} → port ${msg.port}` });
      break;
    }

    case "thinking":
      store.addMessage(createAssistantMessage(msg.content as string));
      break;

    case "analysis_complete": {
      const thinking = msg.thinking as string | undefined;
      if (thinking) store.addMessage(createAssistantMessage(thinking));
      const files = msg.files as string[] | undefined;
      if (files?.length) store.addMessage(createSystemMessage(`Analyzing: ${files.join(", ")}`, true));
      break;
    }

    case "file_diff": {
      const filepath = msg.filepath as string;
      const before = msg.before as string;
      const after = msg.after as string;
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
      log({ level: "info", source: "editor", message: `Block applied: ${msg.filepath}` });
      break;

    case "iteration_complete": {
      const applied = msg.applied as number;
      const failed = msg.failed as number;
      if (failed > 0) {
        const errors = (msg.errors as string[] | undefined) ?? [];
        store.addMessage(createErrorMessage(`Applied ${applied} changes, ${failed} errors`, errors.join("\n") || undefined));
        log({ level: "error", source: "iteration", message: `${failed} blocks failed`, details: errors.join("\n") });
      } else if (applied > 0) {
        store.addMessage(createAssistantMessage(`Applied ${applied} changes [ok]`));
      }
      store.setStatus("ready");
      break;
    }

    case "version_created":
      store.addVersion({ number: msg.version as number, hash: msg.hash as string, description: msg.description as string, timestamp: Date.now() });
      log({ level: "info", source: "git", message: `Version v${msg.version} committed`, details: `Hash: ${(msg.hash as string)?.slice(0, 8)}` });
      break;

    case "autofix_start":
      store.addMessage(createSystemMessage(`Autofix: ${msg.file} - ${(msg.error as string).slice(0, 100)}`, false));
      log({ level: "warn", source: "autofix", message: `Starting autofix: ${msg.file}`, details: (msg.error as string)?.slice(0, 300) });
      break;

    case "autofix_success":
      store.addMessage(createAssistantMessage(`Error fixed (attempt ${msg.attempts}) [ok]`));
      log({ level: "info", source: "autofix", message: `Fixed on attempt ${msg.attempts}` });
      break;

    case "autofix_failed":
      store.addMessage(createErrorMessage(`Could not fix after ${msg.attempts} attempts.`, msg.error as string | undefined, msg.file as string | undefined));
      log({ level: "error", source: "autofix", message: `Autofix failed after ${msg.attempts} attempts`, details: `File: ${msg.file ?? "unknown"}\n${msg.error ?? ""}` });
      store.setStatus("error");
      break;

    case "reloading_preview":
      store.addMessage(createSystemMessage("Reverting version, reloading preview...", false));
      break;

    case "system_error":
      store.addMessage(createErrorMessage(`Error: ${msg.error}`, msg.error as string | undefined, msg.file as string | undefined));
      log({ level: "error", source: "system", message: String(msg.error), details: msg.file ? `File: ${msg.file}` : undefined });
      store.setStatus("error");
      break;

    case "generation_aborted":
      store.addMessage(createSystemMessage("Generation aborted by user", false));
      store.setStatus("ready");
      log({ level: "warn", source: "pipeline", message: "Generation aborted by user" });
      break;

    case "project_created": {
      const pName = msg.projectName as string;
      const existing = store.projectList.find((p) => p.name === pName);
      set({ projectName: pName });
      store.addProject({
        name: pName,
        displayName: existing?.displayName ?? pName,
        status: "ready",
        port: (msg.port as number) ?? existing?.port ?? null,
        createdAt: existing?.createdAt ?? Date.now(),
      });
      log({ level: "info", source: "pipeline", message: `Project created: ${pName}`, details: `Port: ${msg.port ?? "none"}` });
      break;
    }

    case "iteration_result":
      break;

    case "autofix_attempt":
      store.addMessage(createSystemMessage(`Autofix: attempt ${msg.attempt}/${msg.maxAttempts}`, true));
      log({ level: "warn", source: "autofix", message: `Attempt ${msg.attempt}/${msg.maxAttempts}` });
      break;

    case "autofix_block":
      store.addMessage(createSystemMessage(`Fix: ${msg.filepath}`, true));
      log({ level: "info", source: "autofix", message: `Fix applied: ${msg.filepath}` });
      break;

    case "lm_studio_status":
    case "llm_server_status": {
      const lmStatus = msg.status as "connected" | "disconnected" | "checking";
      set({ lmStudioStatus: lmStatus });
      if (lmStatus === "disconnected") log({ level: "error", source: "llm-server", message: "LLM server disconnected" });
      else if (lmStatus === "connected") log({ level: "info", source: "llm-server", message: "LLM server connected" });
      break;
    }

    default:
      if (type !== "iteration_result") {
        log({ level: "info", source: "ws", message: `Event: ${type}` });
      }
      break;
  }
};
