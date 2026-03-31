import { useEffect, useCallback, useState } from "react";
import { useProjectStore } from "@/stores/project-store";
import { useSettingsStore } from "@/stores/settings-store";

// ── Singleton WebSocket stored on window object ──
// The ONLY way to survive Metro HMR + React StrictMode + lazy bundles.
// Key insight: direct `new WebSocket()` in browser works fine (tested).
// The bug was reconnect logic creating competing connections.

const G = typeof window !== "undefined" ? (window as Record<string, unknown>) : ({} as Record<string, unknown>);
const WS_KEY = "__af_ws__";
const INIT_KEY = "__af_ws_init__";

const ensureConnected = (): void => {
  const existing = G[WS_KEY] as WebSocket | undefined;
  if (existing && (existing.readyState === WebSocket.OPEN || existing.readyState === WebSocket.CONNECTING)) {
    return;
  }

  const agentUrl = useSettingsStore.getState().agentUrl;
  const wsUrl = agentUrl.replace("http://", "ws://").replace("https://", "wss://");

  const ws = new WebSocket(wsUrl);
  G[WS_KEY] = ws;

  ws.onopen = () => {
    console.log("[WS] Connected ✓ (stable)");
    useProjectStore.getState().setConnected(true);
  };

  ws.onmessage = (event) => {
    try {
      useProjectStore.getState().handleWsMessage(JSON.parse(event.data));
    } catch { /* skip */ }
  };

  ws.onclose = (e) => {
    console.log("[WS] Closed code=" + e.code + " clean=" + e.wasClean);
    // Only reconnect if this is still THE active WS
    if (G[WS_KEY] === ws) {
      G[WS_KEY] = undefined;
      useProjectStore.getState().setConnected(false);
      // Single reconnect after 3s — no recursive cascade
      setTimeout(() => ensureConnected(), 3000);
    }
  };

  ws.onerror = () => {
    // onerror is always followed by onclose
  };
};

// Connect once on first import (guarded)
if (typeof window !== "undefined" && !G[INIT_KEY]) {
  G[INIT_KEY] = true;
  // Delay to let Zustand stores hydrate from localStorage
  setTimeout(() => ensureConnected(), 500);
}

// ── React hook — thin wrapper, NO useEffect connection logic ──
export const useWebSocket = () => {
  // Force re-render when connection state changes
  const isConnected = useProjectStore((s) => s.isConnected);

  const send = useCallback((message: Record<string, unknown>) => {
    const ws = G[WS_KEY] as WebSocket | undefined;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.warn("[WS] Not connected, cannot send");
      return;
    }
    ws.send(JSON.stringify(message));
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

  return { send, createProject, iterate, abortGeneration, revertVersion, isConnected };
};
