import { useEffect, useRef, useCallback } from "react";
import { useProjectStore } from "@/stores/project-store";
import { useSettingsStore } from "@/stores/settings-store";

const RECONNECT_INTERVAL = 3000;
const MAX_RECONNECT_ATTEMPTS = 10;

export const useWebSocket = () => {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttempts = useRef(0);
  const reconnectTimer = useRef<NodeJS.Timeout | null>(null);

  const agentUrl = useSettingsStore((s) => s.agentUrl);
  const handleWsMessage = useProjectStore((s) => s.handleWsMessage);
  const setConnected = useProjectStore((s) => s.setConnected);

  const wsUrl = agentUrl.replace("http://", "ws://").replace("https://", "wss://");

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("[WS] Connected to agent");
        reconnectAttempts.current = 0;
        setConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          handleWsMessage(msg);
        } catch {
          console.error("[WS] Invalid message");
        }
      };

      ws.onclose = () => {
        console.log("[WS] Disconnected");
        setConnected(false);
        scheduleReconnect();
      };

      ws.onerror = () => {
        setConnected(false);
      };
    } catch {
      setConnected(false);
      scheduleReconnect();
    }
  }, [wsUrl, handleWsMessage, setConnected]);

  const scheduleReconnect = useCallback(() => {
    if (reconnectAttempts.current >= MAX_RECONNECT_ATTEMPTS) return;
    if (reconnectTimer.current) return;

    reconnectAttempts.current++;
    reconnectTimer.current = setTimeout(() => {
      reconnectTimer.current = null;
      connect();
    }, RECONNECT_INTERVAL);
  }, [connect]);

  const send = useCallback((message: Record<string, unknown>) => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) {
      console.warn("[WS] Not connected");
      return;
    }
    wsRef.current.send(JSON.stringify(message));
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
        .filter((m) => !m.isHidden && (m.role === "user" || m.role === "assistant"))
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

      send({
        type: "iterate",
        projectName,
        userRequest,
        chatHistory,
        lmStudioUrl,
      });
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

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return {
    send,
    createProject,
    iterate,
    abortGeneration,
    revertVersion,
    isConnected: wsRef.current?.readyState === WebSocket.OPEN,
  };
};
