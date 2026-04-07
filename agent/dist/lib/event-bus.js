import { AsyncLocalStorage } from "node:async_hooks";
import { WebSocket } from "ws";
import { createPreviewProxy } from "../services/preview-proxy.js";
// ── WebSocket clients ──
const clients = new Map();
const eventScopeStorage = new AsyncLocalStorage();
const mergeScopeIntoMessage = (message, scope) => {
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
const getEffectiveScope = (scope) => {
    if (scope) {
        return scope;
    }
    return eventScopeStorage.getStore();
};
const sendScopedToClient = (clientId, message, scope) => {
    const ws = clients.get(clientId);
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        return;
    }
    safeSend(clientId, ws, JSON.stringify(mergeScopeIntoMessage(message, getEffectiveScope(scope))));
};
export const runWithEventScope = (scope, task) => eventScopeStorage.run(scope, task);
export const registerClient = (clientId, ws) => {
    clients.set(clientId, ws);
};
export const unregisterClient = (clientId) => {
    clients.delete(clientId);
};
const safeSend = (clientId, ws, data) => {
    try {
        ws.send(data);
    }
    catch {
        unregisterClient(clientId);
        try {
            ws.close();
        }
        catch {
            // Socket is already closing/closed.
        }
    }
};
export const broadcast = (message, scope) => {
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
export const sendToClient = (clientId, message, scope) => {
    sendScopedToClient(clientId, message, scope);
};
const projectPorts = new Map();
const proxyCache = new Map();
export const setPreviewPort = (projectName, port) => {
    if (port === null) {
        projectPorts.delete(projectName);
        proxyCache.delete(projectName);
    }
    else {
        const prev = projectPorts.get(projectName);
        if (prev !== port) {
            proxyCache.delete(projectName);
        }
        projectPorts.set(projectName, port);
    }
    console.log(`[Preview] ${projectName} → port ${port}`);
};
export const getPreviewPort = (projectName) => projectPorts.get(projectName) ?? null;
const getOrCreateProxy = (projectName) => {
    const port = projectPorts.get(projectName);
    if (!port)
        return null;
    const cached = proxyCache.get(projectName);
    if (cached && cached.port === port)
        return cached;
    const proxy = createPreviewProxy(port, projectName);
    const entry = { port, proxy };
    proxyCache.set(projectName, entry);
    return entry;
};
export const handlePreviewRequest = (req, res, next) => {
    // Extract project name from URL: /preview/:projectName/...
    const pathAfterPreview = req.path; // already stripped of /preview by Express mount
    const segments = pathAfterPreview.split("/").filter(Boolean);
    let projectName;
    try {
        projectName = segments[0] ? decodeURIComponent(segments[0]) : undefined;
    }
    catch {
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
//# sourceMappingURL=event-bus.js.map