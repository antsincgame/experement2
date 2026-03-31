import { useEffect, useCallback } from "react";
import { useProjectStore } from "@/stores/project-store";
import { useSettingsStore } from "@/stores/settings-store";

// ── Module-level WebSocket singleton ──
// React 18 StrictMode double-mounts components, which causes
// useEffect cleanup to close the WS immediately after opening.
// Solution: keep WS outside React lifecycle as a module singleton.

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;
const MAX_RECONNECT = 100;
const RECONNECT_MS = 3000;

const getWsUrl = (): string => {
  const agentUrl = useSettingsStore.getState().agentUrl;
  return agentUrl.replace("http://", "ws://").replace("https://", "wss://");
};

const connectWs = (): void => {
  if (ws?.readyState === WebSocket.OPEN || ws?.readyState === WebSocket.CONNECTING) return;

  const wsUrl = getWsUrl();
  console.log("[WS] Connecting to:", wsUrl);

  try {
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log("[WS] Connected ✓");
      reconnectAttempts = 0;
      useProjectStore.getState().setConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        useProjectStore.getState().handleWsMessage(msg);
      } catch {
        console.error("[WS] Invalid message");
      }
    };

    ws.onclose = () => {
      console.log("[WS] Disconnected");
      ws = null;
      useProjectStore.getState().setConnected(false);
      scheduleReconnect();
    };

    ws.onerror = (e) => {
      console.error("[WS] Error:", e);
    };
  } catch (err) {
    console.error("[WS] Failed to create:", err);
    ws = null;
    scheduleReconnect();
  }
};

const scheduleReconnect = (): void => {
  if (reconnectTimer) return;
  if (reconnectAttempts >= MAX_RECONNECT) return;
  reconnectAttempts++;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectWs();
  }, RECONNECT_MS);
};

// Auto-connect on module load
connectWs();

// ── React hook (thin wrapper) ──

export const useWebSocket = () => {
  // Ensure connection on mount (no cleanup — singleton lives forever)
  useEffect(() => {
    if (!ws || ws.readyState === WebSocket.CLOSED) {
      connectWs();
    }
  }, []);

  const send = useCallback((message: Record<string, unknown>) => {
    if (ws?.readyState !== WebSocket.OPEN) {
      console.warn("[WS] Not connected, cannot send");
      return;
    }
    ws.send(JSON.stringify(message));
  }, []);

  const createProject = useCallback(
    (description: string) => {
      const lmStudioUrl = useSettingsStore.getState().lmStudioUrl;
      send({ type: "create_project", description, lmStudioUrl });
    },
    [send]
  );

  const iterate = useCallback(
    (userRequest: string) => {
      const { projectName, messages } = useProjectStore.getState();
      const lmStudioUrl = useSettingsStore.getState().lmStudioUrl;
      if (!projectName) return;

      const chatHistory = messages
        .filter((m: { isHidden?: boolean; role: string }) => !m.isHidden && (m.role === "user" || m.role === "assistant"))
        .map((m: { role: string; content: string }) => ({ role: m.role as "user" | "assistant", content: m.content }));

      send({ type: "iterate", projectName, userRequest, chatHistory, lmStudioUrl });
    },
    [send]
  );

  const abortGeneration = useCallback(() => send({ type: "abort_generation" }), [send]);

  const revertVersion = useCallback(
    (commitHash: string) => {
      const projectName = useProjectStore.getState().projectName;
      if (!projectName) return;
      send({ type: "revert_version", projectName, commitHash });
    },
    [send]
  );

  return { send, createProject, iterate, abortGeneration, revertVersion };
};
