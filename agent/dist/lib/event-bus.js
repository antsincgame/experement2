import { WebSocket } from "ws";
import { createPreviewProxy } from "../services/preview-proxy.js";
const clients = new Map();
let activePreviewPort = null;
let cachedProxy = null;
let cachedProxyPort = null;
export const registerClient = (clientId, ws) => {
    clients.set(clientId, ws);
};
export const unregisterClient = (clientId) => {
    clients.delete(clientId);
};
export const broadcast = (message) => {
    const data = JSON.stringify(message);
    for (const ws of clients.values()) {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(data);
        }
    }
};
export const sendToClient = (clientId, message) => {
    const ws = clients.get(clientId);
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        return;
    }
    ws.send(JSON.stringify(message));
};
export const handlePreviewRequest = (req, res, next) => {
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
export const setPreviewPort = (port) => {
    if (port !== activePreviewPort) {
        cachedProxy = null;
        cachedProxyPort = null;
    }
    activePreviewPort = port;
    console.log(`[Preview] Port set to: ${port}`);
};
//# sourceMappingURL=event-bus.js.map