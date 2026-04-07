// Centralizes preview routing and explicit scope-aware WebSocket delivery so project events do not leak across clients.
import type { NextFunction, Request, Response } from "express";
import { AsyncLocalStorage } from "node:async_hooks";
import { WebSocket } from "ws";
import { createPreviewProxy } from "../services/preview-proxy.js";

// ── WebSocket clients ──
const clients = new Map<string, WebSocket>();

export interface EventScope {
  clientId?: string;
  projectName?: string;
  requestId?: string;
}

const eventScopeStorage = new AsyncLocalStorage<EventScope>();

const mergeScopeIntoMessage = (
  message: Record<string, unknown>,
  scope?: EventScope
): Record<string, unknown> => {
  const effectiveScope = scope ?? eventScopeStorage.getStore();
  if (!effectiveScope) {
    return message;
  }

  return {
    ...(effectiveScope.projectName && message.projectName === undefined ? { projectName: effectiveScope.projectName } : {}),
    ...(effectiveScope.requestId && message.requestId === undefined ? { requestId: effectiveScope.requestId } : {}),
    ...message,
  };
};

const getEffectiveScope = (scope?: EventScope): EventScope | undefined => {
  if (scope) {
    return scope;
  }

  return eventScopeStorage.getStore();
};

const sendScopedToClient = (
  clientId: string,
  message: Record<string, unknown>,
  scope?: EventScope
): void => {
  const ws = clients.get(clientId);
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    return;
  }

  safeSend(
    clientId,
    ws,
    JSON.stringify(mergeScopeIntoMessage(message, getEffectiveScope(scope)))
  );
};

export const runWithEventScope = <T>(scope: EventScope, task: () => T): T =>
  eventScopeStorage.run(scope, task);

export const registerClient = (clientId: string, ws: WebSocket): void => {
  clients.set(clientId, ws);
};

export const unregisterClient = (clientId: string): void => {
  clients.delete(clientId);
};

const safeSend = (clientId: string, ws: WebSocket, data: string): void => {
  try {
    ws.send(data);
  } catch {
    unregisterClient(clientId);
    try {
      ws.close();
    } catch {
      // Socket is already closing/closed.
    }
  }
};

export const broadcast = (
  message: Record<string, unknown>,
  scope?: EventScope
): void => {
  const effectiveScope = getEffectiveScope(scope);
  const scopedMessage = mergeScopeIntoMessage(message, effectiveScope);
  if (effectiveScope?.clientId) {
    sendScopedToClient(effectiveScope.clientId, scopedMessage);
    return;
  }

  const data = JSON.stringify(scopedMessage);
  for (const [clientId, ws] of clients.entries()) {
    if (ws.readyState === WebSocket.OPEN) {
      safeSend(clientId, ws, data);
    }
  }
};

export const sendToClient = (
  clientId: string,
  message: Record<string, unknown>,
  scope?: EventScope
): void => {
  sendScopedToClient(clientId, message, scope);
};

// ── Per-project preview proxy ──
interface ProxyEntry {
  port: number;
  proxy: ReturnType<typeof createPreviewProxy>;
}

const projectPorts = new Map<string, number>();
const proxyCache = new Map<string, ProxyEntry>();

export const setPreviewPort = (projectName: string, port: number | null): void => {
  if (port === null) {
    projectPorts.delete(projectName);
    proxyCache.delete(projectName);
  } else {
    const prev = projectPorts.get(projectName);
    if (prev !== port) {
      proxyCache.delete(projectName);
    }
    projectPorts.set(projectName, port);
  }
  console.log(`[Preview] ${projectName} → port ${port}`);
};

export const getPreviewPort = (projectName: string): number | null =>
  projectPorts.get(projectName) ?? null;

const getOrCreateProxy = (projectName: string): ProxyEntry | null => {
  const port = projectPorts.get(projectName);
  if (!port) return null;

  const cached = proxyCache.get(projectName);
  if (cached && cached.port === port) return cached;

  const proxy = createPreviewProxy(port, projectName);
  const entry: ProxyEntry = { port, proxy };
  proxyCache.set(projectName, entry);
  return entry;
};

export const handlePreviewRequest = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Extract project name from URL: /preview/:projectName/...
  const pathAfterPreview = req.path; // already stripped of /preview by Express mount
  const segments = pathAfterPreview.split("/").filter(Boolean);
  let projectName: string | undefined;

  try {
    projectName = segments[0] ? decodeURIComponent(segments[0]) : undefined;
  } catch {
    res.status(400).send("Preview project name is not valid URL encoding.");
    return;
  }

  if (!projectName) {
    res.status(400).send("Preview requests must include a project name.");
    return;
  }

  const entry = getOrCreateProxy(projectName);
  if (!entry) {
    res.status(503).send(`Preview for "${projectName}" is not running.`);
    return;
  }

  // Strip /:projectName from the forwarded path
  req.url = "/" + segments.slice(1).join("/") + (req.url.includes("?") ? "?" + req.url.split("?")[1] : "");

  entry.proxy(req, res, next);
};
