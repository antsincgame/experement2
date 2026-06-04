// Keeps one reconnecting WebSocket instance synchronized with the active agent URL and scoped request metadata.
import { useCallback, useEffect } from "react";
import type { ChatMessage } from "@/features/chat/schemas/message.schema";
import { apiClient, normalizeBaseUrl } from "@/shared/lib/api-client";
import {
  parseIncomingWsMessage,
  type OutgoingWsMessage,
} from "@/shared/schemas/ws-messages";
import { useProjectStore } from "@/stores/project-store";
import { useSettingsStore } from "@/stores/settings-store";
import { isCreatingRoute } from "@/shared/lib/creation-flow";

const logError = (source: string, message: string, details?: string) => {
  useSettingsStore.getState().addErrorLog({ level: "error", source, message, details });
};
const logWarn = (source: string, message: string) => {
  useSettingsStore.getState().addErrorLog({ level: "warn", source, message });
};
const logInfo = (source: string, message: string) => {
  useSettingsStore.getState().addErrorLog({ level: "info", source, message });
};

interface WsRuntime {
  currentUrl?: string;
  initialized?: boolean;
  initialConnectTimer?: ReturnType<typeof setTimeout>;
  reconnectTimer?: ReturnType<typeof setTimeout>;
  socket?: WebSocket;
  messageQueue?: string[];
  settingsUnsubscribe?: () => void;
  // Number of mounted useWebSocket consumers. The hook mounts in the app shell
  // AND in home/project screens; tearing the socket down on every screen unmount
  // caused reconnect churn. Dispose only when the last consumer unmounts.
  mountCount?: number;
}

const createRequestId = (): string => crypto.randomUUID();

const STALE_ACTIVE_STATUSES = new Set([
  "planning",
  "scaffolding",
  "generating",
  "analyzing",
  "building",
  "iterating",
]);

/** After reconnect, nudge preview for projects stuck in non-terminal UI states. */
const resyncActiveProjectAfterReconnect = (): void => {
  const { projectName, status } = useProjectStore.getState();
  // The "__creating__" slug is a UI placeholder for an in-flight creation; the
  // backend has no such project, so resyncing a preview for it would 404.
  if (!projectName || isCreatingRoute(projectName) || !STALE_ACTIVE_STATUSES.has(status)) {
    return;
  }

  const { lmStudioUrl, model, editorModel } = useSettingsStore.getState();
  const runtime = getRuntime();
  const socket = runtime.socket;
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return;
  }

  const payload = JSON.stringify({
    type: "start_preview",
    requestId: createRequestId(),
    projectName,
    lmStudioUrl,
    ...(model ? { model } : {}),
    ...(editorModel ? { editorModel } : {}),
  });

  try {
    socket.send(payload);
    logInfo("websocket", `Resync start_preview for ${projectName} (${status})`);
  } catch (error) {
    enqueueMessage(payload);
    logWarn(
      "websocket",
      `Resync preview failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
};

const GLOBAL_SCOPE = globalThis as Record<string, unknown>;
const WS_RUNTIME_KEY = "__af_ws_runtime__";

const getRuntime = (): WsRuntime => {
  const existingRuntime = GLOBAL_SCOPE[WS_RUNTIME_KEY] as WsRuntime | undefined;
  if (existingRuntime) {
    if (!existingRuntime.messageQueue) existingRuntime.messageQueue = [];
    return existingRuntime;
  }

  const nextRuntime: WsRuntime = { messageQueue: [] };
  GLOBAL_SCOPE[WS_RUNTIME_KEY] = nextRuntime;
  return nextRuntime;
};

const clearReconnectTimer = (): void => {
  const runtime = getRuntime();
  if (!runtime.reconnectTimer) {
    return;
  }

  clearTimeout(runtime.reconnectTimer);
  runtime.reconnectTimer = undefined;
};

const clearInitialConnectTimer = (): void => {
  const runtime = getRuntime();
  if (!runtime.initialConnectTimer) {
    return;
  }

  clearTimeout(runtime.initialConnectTimer);
  runtime.initialConnectTimer = undefined;
};

const disconnectSocket = (): void => {
  const runtime = getRuntime();
  const socket = runtime.socket;
  if (!socket) {
    return;
  }

  runtime.socket = undefined;
  runtime.currentUrl = undefined;
  socket.onopen = null;
  socket.onmessage = null;
  socket.onclose = null;
  socket.onerror = null;

  if (
    socket.readyState === WebSocket.OPEN ||
    socket.readyState === WebSocket.CONNECTING
  ) {
    socket.close(1000, "agent-url-changed");
  }

  useProjectStore.getState().setConnected(false);
};

let reconnectAttempt = 0;

const getBackoffDelay = (): number => {
  const base = Math.min(1000 * Math.pow(2, reconnectAttempt), 30000);
  const jitter = Math.random() * 1000;
  return base + jitter;
};

const scheduleReconnect = (): void => {
  const runtime = getRuntime();
  clearReconnectTimer();
  const delay = getBackoffDelay();
  reconnectAttempt++;
  runtime.reconnectTimer = setTimeout(() => {
    runtime.reconnectTimer = undefined;
    ensureConnected();
  }, delay);
};

const handleSocketMessage = (payload: string): void => {
  try {
    const message = parseIncomingWsMessage(JSON.parse(payload));
    if (!message) {
      logWarn("websocket", "Ignored unknown message shape from agent");
      return;
    }

    useProjectStore.getState().handleWsMessage(message);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logError("websocket", `Failed to parse message: ${msg}`, payload.slice(0, 500));
  }
};

// Caps the offline queue so a long disconnect (with retries) cannot grow it
// without bound; the newest intent is the most relevant, so the oldest is dropped.
const MAX_QUEUED_MESSAGES = 100;

const enqueueMessage = (payload: string): void => {
  const queue = getRuntime().messageQueue;
  if (!queue) {
    return;
  }

  queue.push(payload);
  if (queue.length > MAX_QUEUED_MESSAGES) {
    const dropped = queue.splice(0, queue.length - MAX_QUEUED_MESSAGES).length;
    logWarn(
      "websocket",
      `Outgoing queue exceeded ${MAX_QUEUED_MESSAGES}; dropped ${dropped} oldest message(s)`
    );
  }
};

const ensureConnected = (): void => {
  if (typeof WebSocket === "undefined") {
    return;
  }

  const runtime = getRuntime();
  const nextUrl = apiClient.getWebSocketUrl();
  const existingSocket = runtime.socket;

  if (
    existingSocket &&
    runtime.currentUrl === nextUrl &&
    (existingSocket.readyState === WebSocket.OPEN ||
      existingSocket.readyState === WebSocket.CONNECTING)
  ) {
    return;
  }

  clearReconnectTimer();
  disconnectSocket();

  const socket = new WebSocket(nextUrl);
  runtime.socket = socket;
  runtime.currentUrl = nextUrl;

  socket.onopen = () => {
    if (getRuntime().socket !== socket) {
      return;
    }
    reconnectAttempt = 0;

    clearReconnectTimer();
    useProjectStore.getState().setConnected(true);
    logInfo("websocket", `Connected ${nextUrl}`);

    const runtime = getRuntime();
    if (runtime.messageQueue && runtime.messageQueue.length > 0) {
      logInfo("websocket", `Flushing ${runtime.messageQueue.length} queued messages`);
      const queue = [...runtime.messageQueue];
      runtime.messageQueue = [];
      for (const payload of queue) {
        try {
          socket.send(payload);
        } catch (error) {
          enqueueMessage(payload);
          logWarn(
            "websocket",
            `Failed to flush queued message: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    }

    resyncActiveProjectAfterReconnect();
  };

  socket.onmessage = (event) => {
    handleSocketMessage(event.data);
  };

  socket.onclose = (event) => {
    if (getRuntime().socket !== socket) {
      return;
    }

    runtime.socket = undefined;
    runtime.currentUrl = undefined;
    useProjectStore.getState().setConnected(false);
    logInfo("websocket", `Closed code=${event.code} clean=${event.wasClean}`);
    logWarn("websocket", `Disconnected (code=${event.code}, clean=${event.wasClean}), reconnecting...`);
    scheduleReconnect();
  };

  socket.onerror = () => {
    logWarn("websocket", `Socket error for ${nextUrl}`);
    logWarn("websocket", `Connection error: ${nextUrl}`);
  };
};

const initializeRuntime = (): void => {
  const runtime = getRuntime();
  if (runtime.initialized) {
    return;
  }

  runtime.initialized = true;
  let previousAgentUrl = normalizeBaseUrl(useSettingsStore.getState().agentUrl);

  runtime.settingsUnsubscribe = useSettingsStore.subscribe((state) => {
    const nextAgentUrl = normalizeBaseUrl(state.agentUrl);
    if (nextAgentUrl === previousAgentUrl) {
      return;
    }

    previousAgentUrl = nextAgentUrl;
    clearReconnectTimer();
    disconnectSocket();
    ensureConnected();
  });

  runtime.initialConnectTimer = setTimeout(() => {
    getRuntime().initialConnectTimer = undefined;
    ensureConnected();
  }, 500);
};

export const disposeWebSocketRuntime = (): void => {
  const runtime = getRuntime();
  runtime.settingsUnsubscribe?.();
  runtime.settingsUnsubscribe = undefined;
  clearInitialConnectTimer();
  clearReconnectTimer();
  disconnectSocket();
  runtime.initialized = false;
};

export const useWebSocket = () => {
  useEffect(() => {
    const runtime = getRuntime();
    runtime.mountCount = (runtime.mountCount ?? 0) + 1;
    initializeRuntime();
    return () => {
      const current = getRuntime();
      current.mountCount = Math.max(0, (current.mountCount ?? 1) - 1);
      // Keep the single shared socket alive while any consumer (e.g. the app
      // shell) is still mounted; only tear down when the last one unmounts.
      if (current.mountCount === 0) {
        disposeWebSocketRuntime();
      }
    };
  }, []);

  const send = useCallback((message: OutgoingWsMessage): boolean => {
    const runtime = getRuntime();
    const socket = runtime.socket;
    const payload = JSON.stringify(message);

    if (!socket || socket.readyState !== WebSocket.OPEN) {
      enqueueMessage(payload);
      ensureConnected();
      return true;
    }

    try {
      socket.send(payload);
      return true;
    } catch (error) {
      // Socket may have closed between readyState check and send
      enqueueMessage(payload);
      logWarn(
        "websocket",
        `Send failed, retrying after reconnect: ${error instanceof Error ? error.message : String(error)}`
      );
      ensureConnected();
      return true;
    }
  }, []);

  const createProject = useCallback((description: string): string => {
    const { lmStudioUrl, model, plannerModel, editorModel, embeddingModel, semanticRagEnabled, autoPolishEnabled, temperature, maxTokens, topP } =
      useSettingsStore.getState();
    // Return the requestId so the caller can scope WS events to THIS creation.
    const requestId = createRequestId();
    send({
      type: "create_project",
      requestId,
      description,
      lmStudioUrl,
      ...(model ? { model } : {}),
      ...(plannerModel ? { plannerModel } : {}),
      ...(editorModel ? { editorModel } : {}),
      semanticRagEnabled,
      ...(autoPolishEnabled ? { autoPolishEnabled } : {}),
      ...(embeddingModel.trim() ? { embeddingModel: embeddingModel.trim() } : {}),
      temperature,
      maxTokens,
      topP,
    });
    return requestId;
  }, [send]);

  const iterate = useCallback((userRequest: string) => {
    const { projectName, messages } = useProjectStore.getState();
    if (!projectName) {
      return;
    }

    const chatHistory = messages
      .filter((message): message is ChatMessage & { role: "user" | "assistant" } => (
        !message.isHidden &&
        (message.role === "user" || message.role === "assistant")
      ))
      .map((message) => ({
        role: message.role,
        content: message.content,
      }));

    const { lmStudioUrl, model, editorModel, temperature, maxTokens, topP } = useSettingsStore.getState();
    send({
      type: "iterate",
      requestId: createRequestId(),
      projectName,
      userRequest,
      chatHistory,
      lmStudioUrl,
      ...(model ? { model } : {}),
      ...(editorModel ? { editorModel } : {}),
      temperature,
      maxTokens,
      topP,
    });
  }, [send]);

  const startPreview = useCallback((projectName: string) => {
    if (!projectName || isCreatingRoute(projectName)) {
      return;
    }
    const { lmStudioUrl, model, editorModel } = useSettingsStore.getState();
    send({
      type: "start_preview",
      requestId: createRequestId(),
      projectName,
      lmStudioUrl,
      ...(model ? { model } : {}),
      ...(editorModel ? { editorModel } : {}),
    });
  }, [send]);

  const abortGeneration = useCallback(() => {
    send({ type: "abort_generation", requestId: createRequestId() });
  }, [send]);

  const revertVersion = useCallback((commitHash: string) => {
    const projectName = useProjectStore.getState().projectName;
    if (!projectName) {
      return;
    }

    const { lmStudioUrl, model } = useSettingsStore.getState();
    send({
      type: "revert_version",
      requestId: createRequestId(),
      projectName,
      commitHash,
      lmStudioUrl,
      ...(model ? { model } : {}),
    });
  }, [send]);

  return {
    abortGeneration,
    createProject,
    iterate,
    revertVersion,
    send,
    startPreview,
  };
};
