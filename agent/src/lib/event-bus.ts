// Centralizes preview routing and WebSocket broadcasts so server and pipeline stay decoupled.
import type { NextFunction, Request, Response } from "express";
import { WebSocket } from "ws";
import { createPreviewProxy } from "../services/preview-proxy.js";

const clients = new Map<string, WebSocket>();

let activePreviewPort: number | null = null;
let cachedProxy: ReturnType<typeof createPreviewProxy> | null = null;
let cachedProxyPort: number | null = null;

export const registerClient = (clientId: string, ws: WebSocket): void => {
  clients.set(clientId, ws);
};

export const unregisterClient = (clientId: string): void => {
  clients.delete(clientId);
};

export const broadcast = (message: Record<string, unknown>): void => {
  const data = JSON.stringify(message);

  for (const ws of clients.values()) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  }
};

export const sendToClient = (
  clientId: string,
  message: Record<string, unknown>
): void => {
  const ws = clients.get(clientId);
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    return;
  }

  ws.send(JSON.stringify(message));
};

export const handlePreviewRequest = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (!activePreviewPort) {
    res.status(503).send("No preview available yet. Metro is not running.");
    return;
  }

  if (!cachedProxy || cachedProxyPort !== activePreviewPort) {
    cachedProxy = createPreviewProxy(activePreviewPort);
    cachedProxyPort = activePreviewPort;
  }

  cachedProxy(req, res, next);
};

export const setPreviewPort = (port: number | null): void => {
  if (port !== activePreviewPort) {
    cachedProxy = null;
    cachedProxyPort = null;
  }

  activePreviewPort = port;
  console.log(`[Preview] Port set to: ${port}`);
};
