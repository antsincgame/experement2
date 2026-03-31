import { useEffect, useCallback } from "react";
import { useProjectStore } from "@/stores/project-store";
import { useSettingsStore } from "@/stores/settings-store";

// ── globalThis singleton — survives HMR + React StrictMode ──
// Module-level variables get RESET on Metro HMR reload.
// globalThis (window) persists across reloads.

const WS_KEY = "__appfactory_ws__";
const TIMER_KEY = "__appfactory_ws_timer__";
const MAX_RECONNECT = 200;
const RECONNECT_MS = 3000;

const getWs = (): WebSocket | null => (globalThis as Record<string, unknown>)[WS_KEY] as WebSocket | null ?? null;
const setWs = (w: WebSocket | null): void => { (globalThis as Record<string, unknown>)[WS_KEY] = w; };
const getTimer = (): ReturnType<typeof setTimeout> | null => (globalThis as Record<string, unknown>)[TIMER_KEY] as ReturnType<typeof setTimeout> | null ?? null;
const setTimer = (t: ReturnType<typeof setTimeout> | null): void => { (globalThis as Record<string, unknown>)[TIMER_KEY] = t; };

let reconnectAttempts = 0;

const connectWs = (): void => {
  const existing = getWs();
  if (existing && (existing.readyState === WebSocket.OPEN || existing.readyState === WebSocket.CONNECTING)) {
    return; // Already connected or connecting
  }

  const agentUrl = useSettingsStore.getState().agentUrl;
  const wsUrl = agentUrl.replace("http://", "ws://").replace("https://", "wss://");
  console.log("[WS] Connecting to:", wsUrl);

  try {
    const newWs = new WebSocket(wsUrl);
    setWs(newWs);

    newWs.onopen = () => {
      console.log("[WS] Connected ✓");
      reconnectAttempts = 0;
      useProjectStore.getState().setConnected(true);
    };

    newWs.onmessage = (event) => {
      try {
        useProjectStore.getState().handleWsMessage(JSON.parse(event.data));
      } catch { /* skip */ }
    };

    newWs.onclose = () => {
      console.log("[WS] Disconnected");
      // Only reconnect if THIS ws is still the current one
      if (getWs() === newWs) {
        setWs(null);
        useProjectStore.getState().setConnected(false);
        scheduleReconnect();
      }
    };

    newWs.onerror = () => {
      // onerror always followed by onclose
    };
  } catch {
    setWs(null);
    scheduleReconnect();
  }
};

const scheduleReconnect = (): void => {
  if (getTimer()) return;
  if (reconnectAttempts >= MAX_RECONNECT) return;
  reconnectAttempts++;
  setTimer(setTimeout(() => {
    setTimer(null);
    connectWs();
  }, RECONNECT_MS));
};

// Auto-connect on first module load (only if not already connected)
if (!getWs()) connectWs();

// ── React hook ──

export const useWebSocket = () => {
  useEffect(() => {
    const existing = getWs();
    if (!existing || existing.readyState === WebSocket.CLOSED) {
      connectWs();
    }
    // NO cleanup — singleton lives in globalThis
  }, []);

  const send = useCallback((message: Record<string, unknown>) => {
    const current = getWs();
    if (current?.readyState !== WebSocket.OPEN) {
      console.warn("[WS] Not connected");
      return;
    }
    current.send(JSON.stringify(message));
  }, []);

  const createProject = useCallback((description: string) => {
    send({ type: "create_project", description, lmStudioUrl: useSettingsStore.getState().lmStudioUrl });
  }, [send]);

  const iterate = useCallback((userRequest: string) => {
    const { projectName, messages } = useProjectStore.getState();
    if (!projectName) return;
    const chatHistory = messages
      .filter((m: { isHidden?: boolean; role: string }) => !m.isHidden && (m.role === "user" || m.role === "assistant"))
      .map((m: { role: string; content: string }) => ({ role: m.role as "user" | "assistant", content: m.content }));
    send({ type: "iterate", projectName, userRequest, chatHistory, lmStudioUrl: useSettingsStore.getState().lmStudioUrl });
  }, [send]);

  const abortGeneration = useCallback(() => send({ type: "abort_generation" }), [send]);

  const revertVersion = useCallback((commitHash: string) => {
    const projectName = useProjectStore.getState().projectName;
    if (!projectName) return;
    send({ type: "revert_version", projectName, commitHash });
  }, [send]);

  return { send, createProject, iterate, abortGeneration, revertVersion };
};
