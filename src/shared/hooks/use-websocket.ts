// Keeps one reconnecting WebSocket instance synchronized with the active agent URL.
import { useCallback } from "react";
import { apiClient, normalizeBaseUrl } from "@/shared/lib/api-client";
import { useProjectStore } from "@/stores/project-store";
import { useSettingsStore } from "@/stores/settings-store";

const logError = (source: string, message: string, details?: string) => {
  useSettingsStore.getState().addErrorLog({ level: "error", source, message, details });
};
const logWarn = (source: string, message: string) => {
  useSettingsStore.getState().addErrorLog({ level: "warn", source, message });
};

interface WsRuntime {
  currentUrl?: string;
  initialized?: boolean;
  reconnectTimer?: ReturnType<typeof setTimeout>;
  socket?: WebSocket;
}

const GLOBAL_SCOPE = globalThis as Record<string, unknown>;
const WS_RUNTIME_KEY = "__af_ws_runtime__";

const getRuntime = (): WsRuntime => {
  const existingRuntime = GLOBAL_SCOPE[WS_RUNTIME_KEY] as WsRuntime | undefined;
  if (existingRuntime) {
    return existingRuntime;
  }

  const nextRuntime: WsRuntime = {};
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

const scheduleReconnect = (): void => {
  const runtime = getRuntime();
  clearReconnectTimer();
  runtime.reconnectTimer = setTimeout(() => {
    runtime.reconnectTimer = undefined;
    ensureConnected();
  }, 3000);
};

const handleSocketMessage = (payload: string): void => {
  try {
    useProjectStore.getState().handleWsMessage(JSON.parse(payload));
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[WS] Failed to parse message", error);
    logError("websocket", `Failed to parse message: ${msg}`, payload.slice(0, 500));
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

    clearReconnectTimer();
    useProjectStore.getState().setConnected(true);
    console.log(`[WS] Connected ${nextUrl}`);
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
    console.log(`[WS] Closed code=${event.code} clean=${event.wasClean}`);
    scheduleReconnect();
  };

  socket.onerror = () => {
    console.warn(`[WS] Socket error for ${nextUrl}`);
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

  useSettingsStore.subscribe((state) => {
    const nextAgentUrl = normalizeBaseUrl(state.agentUrl);
    if (nextAgentUrl === previousAgentUrl) {
      return;
    }

    previousAgentUrl = nextAgentUrl;
    clearReconnectTimer();
    disconnectSocket();
    ensureConnected();
  });

  setTimeout(() => {
    ensureConnected();
  }, 500);
};

initializeRuntime();

export const useWebSocket = () => {
  const isConnected = useProjectStore((state) => state.isConnected);

  const send = useCallback((message: Record<string, unknown>): boolean => {
    const socket = getRuntime().socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      console.warn("[WS] Not connected, retrying connection");
      ensureConnected();
      return false;
    }

    socket.send(JSON.stringify(message));
    return true;
  }, []);

  const createProject = useCallback((description: string) => {
    const { lmStudioUrl, model, temperature, maxTokens } = useSettingsStore.getState();
    send({
      type: "create_project",
      description,
      lmStudioUrl,
      ...(model ? { model } : {}),
      temperature,
      maxTokens,
    });
  }, [send]);

  const iterate = useCallback((userRequest: string) => {
    const { projectName, messages } = useProjectStore.getState();
    if (!projectName) {
      return;
    }

    const chatHistory = messages
      .filter((message: { isHidden?: boolean; role: string }) => (
        !message.isHidden &&
        (message.role === "user" || message.role === "assistant")
      ))
      .map((message: { content: string; role: string }) => ({
        role: message.role as "user" | "assistant",
        content: message.content,
      }));

    const { lmStudioUrl, model, temperature, maxTokens } = useSettingsStore.getState();
    send({
      type: "iterate",
      projectName,
      userRequest,
      chatHistory,
      lmStudioUrl,
      ...(model ? { model } : {}),
      temperature,
      maxTokens,
    });
  }, [send]);

  const startPreview = useCallback((projectName: string) => {
    const { lmStudioUrl, model } = useSettingsStore.getState();
    send({
      type: "start_preview",
      projectName,
      lmStudioUrl,
      ...(model ? { model } : {}),
    });
  }, [send]);

  const abortGeneration = useCallback(() => {
    send({ type: "abort_generation" });
  }, [send]);

  const revertVersion = useCallback((commitHash: string) => {
    const projectName = useProjectStore.getState().projectName;
    if (!projectName) {
      return;
    }

    const { lmStudioUrl, model } = useSettingsStore.getState();
    send({
      type: "revert_version",
      projectName,
      commitHash,
      lmStudioUrl,
      ...(model ? { model } : {}),
    });
  }, [send]);

  return {
    abortGeneration,
    createProject,
    isConnected,
    iterate,
    revertVersion,
    send,
    startPreview,
  };
};
