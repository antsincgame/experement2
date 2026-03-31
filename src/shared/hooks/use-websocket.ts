import { useEffect, useRef, useCallback } from "react";
import { useProjectStore } from "@/stores/project-store";
import { useSettingsStore } from "@/stores/settings-store";

const RECONNECT_INTERVAL = 3000;
const MAX_RECONNECT_ATTEMPTS = 50;

export const useWebSocket = () => {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttempts = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isConnecting = useRef(false);

  const send = useCallback((message: Record<string, unknown>) => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) {
      console.warn("[WS] Not connected, cannot send");
      return;
    }
    wsRef.current.send(JSON.stringify(message));
  }, []);

  // Stable connect — reads URL from store at call time, no deps
  useEffect(() => {
    const doConnect = () => {
      if (wsRef.current?.readyState === WebSocket.OPEN || isConnecting.current) return;

      const agentUrl = useSettingsStore.getState().agentUrl;
      const wsUrl = agentUrl.replace("http://", "ws://").replace("https://", "wss://");

      isConnecting.current = true;

      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          console.log("[WS] Connected to agent");
          isConnecting.current = false;
          reconnectAttempts.current = 0;
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
          isConnecting.current = false;
          useProjectStore.getState().setConnected(false);

          if (reconnectAttempts.current < MAX_RECONNECT_ATTEMPTS && !reconnectTimer.current) {
            reconnectAttempts.current++;
            reconnectTimer.current = setTimeout(() => {
              reconnectTimer.current = null;
              doConnect();
            }, RECONNECT_INTERVAL);
          }
        };

        ws.onerror = () => {
          isConnecting.current = false;
        };
      } catch {
        isConnecting.current = false;
        useProjectStore.getState().setConnected(false);
      }
    };

    doConnect();

    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, []); // No deps — stable, runs once

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

  const abortGeneration = useCallback(() => {
    send({ type: "abort_generation" });
  }, [send]);

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
