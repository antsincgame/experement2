// Orchestrates HTTP, WebSocket, and preview runtime state with explicit build scope for each client flow.
import express from "express";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import { broadcast, handlePreviewRequest, registerClient, runWithEventScope, sendToClient, setPreviewPort, unregisterClient, } from "./lib/event-bus.js";
import { formatZodError } from "./lib/request-validation.js";
import { createProject, iterateProject, revertVersion } from "./lib/pipeline.js";
import { projectRouter } from "./routes/project.js";
import { llmRouter } from "./routes/llm.js";
import { processRouter } from "./routes/process.js";
import { ProjectParamsSchema, WsMessageSchema, } from "./schemas/runtime-input.schema.js";
import { getProjectPath, listAllFiles, projectExists, readFile, } from "./services/file-manager.js";
import { abortAll, clearModelCache } from "./services/llm-proxy.js";
import { parseMetroError } from "./services/log-watcher.js";
import { attachOperationToQueueKey, enqueueProjectOperation, getProjectOperationQueueKey, WORKSPACE_OPERATION_QUEUE_KEY, } from "./services/project-operation-lock.js";
import { killAll, startExpo, getActivePort } from "./services/process-manager.js";
import { initTemplateCache } from "./services/template-cache.js";
const waitForMetroReady = async (port, maxRetries = 40) => {
    for (let i = 0; i < maxRetries; i++) {
        try {
            const resp = await fetch(`http://127.0.0.1:${port}`, { signal: AbortSignal.timeout(2000) });
            if (resp.ok)
                return true;
        }
        catch { /* Metro not ready yet */ }
        await new Promise((r) => setTimeout(r, 750));
    }
    return false;
};
const PORT = Number(process.env.AGENT_PORT ?? 3100);
const HOST = process.env.AGENT_HOST?.trim() || "127.0.0.1";
const DEFAULT_LM_STUDIO_URL = process.env.LM_STUDIO_URL?.trim() || "http://localhost:1234";
const MAX_WS_PAYLOAD_BYTES = 1024 * 1024;
const app = express();
const server = createServer(app);
const wss = new WebSocketServer({
    server,
    maxPayload: MAX_WS_PAYLOAD_BYTES,
    perMessageDeflate: false,
});
let lmStudioInterval = null;
let isShuttingDown = false;
let currentLlmServerUrl = DEFAULT_LM_STUDIO_URL;
app.use(express.json({ limit: "10mb" }));
const ALLOWED_ORIGINS = (process.env.AGENT_ALLOWED_ORIGINS
    ?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
    ?? ["http://localhost:8081", "http://localhost:8082", "http://127.0.0.1:8081"]);
const ALLOWED_HEADERS = ["Content-Type", "X-App-Factory-Confirm"];
const importModule = new Function("specifier", "return import(specifier);");
const loadArchiver = async () => {
    try {
        return await importModule("archiver");
    }
    catch {
        return null;
    }
};
app.use((req, res, next) => {
    const origin = req.headers.origin ?? "";
    if (ALLOWED_ORIGINS.includes(origin)) {
        res.header("Access-Control-Allow-Origin", origin);
    }
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header("Access-Control-Allow-Headers", ALLOWED_HEADERS.join(", "));
    if (req.method === "OPTIONS") {
        res.sendStatus(204);
        return;
    }
    next();
});
app.get("/health", (_req, res) => {
    res.json({ status: "ok", timestamp: Date.now() });
});
app.use("/api/projects", projectRouter);
app.use("/api/llm", llmRouter);
app.use("/api/process", processRouter);
// ZIP export endpoint
app.get("/api/projects/:name/export", async (req, res) => {
    const params = ProjectParamsSchema.safeParse(req.params);
    if (!params.success) {
        res.status(400).json({
            error: formatZodError(params.error),
            code: "INVALID_INPUT",
        });
        return;
    }
    const { name } = params.data;
    if (!projectExists(name)) {
        res.status(404).json({ error: "Project not found", code: "NOT_FOUND" });
        return;
    }
    const archiver = await loadArchiver();
    if (!archiver) {
        const files = listAllFiles(name);
        const contents = {};
        for (const filePath of files) {
            const content = readFile(name, filePath);
            if (content !== null) {
                contents[filePath] = content;
            }
        }
        res.json({ data: contents });
        return;
    }
    const projectPath = getProjectPath(name);
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${name}.zip"`);
    const archive = archiver.default("zip", { zlib: { level: 6 } });
    let archiveFailed = false;
    const handleArchiveError = (error) => {
        if (archiveFailed) {
            return;
        }
        archiveFailed = true;
        const message = error instanceof Error ? error.message : "Failed to export project archive";
        if (!res.headersSent) {
            res.status(500).json({ error: message, code: "EXPORT_FAILED" });
            return;
        }
        res.destroy(error instanceof Error ? error : undefined);
    };
    archive.once("error", handleArchiveError);
    res.once("error", handleArchiveError);
    res.once("close", () => {
        if (!res.writableEnded) {
            archive.abort();
        }
    });
    archive.pipe(res);
    archive.directory(projectPath, name, {
        ignore: ["node_modules/**", ".expo/**", ".git/**"],
    });
    try {
        await archive.finalize();
    }
    catch (error) {
        handleArchiveError(error);
    }
});
app.use("/preview", handlePreviewRequest);
// в”Ђв”Ђ WebSocket в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
const sendSystemErrorToClient = (clientId, error, step, scope, extra = {}) => {
    sendToClient(clientId, {
        type: "system_error",
        error,
        step,
        ...extra,
    }, scope);
};
const runQueuedOperation = (clientId, queueKey, operationName, step, task, onSuccess, scope = {}) => {
    const eventScope = {
        clientId,
        projectName: scope.projectName,
        requestId: scope.requestId,
    };
    enqueueProjectOperation(queueKey, operationName, () => runWithEventScope(eventScope, task))
        .then((result) => {
        runWithEventScope(eventScope, () => {
            onSuccess?.(result);
        });
    })
        .catch((error) => {
        runWithEventScope(eventScope, () => {
            sendSystemErrorToClient(clientId, error instanceof Error ? error.message : "Unknown error", step, eventScope);
        });
    });
};
wss.on("connection", (ws) => {
    const clientId = crypto.randomUUID();
    registerClient(clientId, ws);
    console.log(`[WS] Client ${clientId.slice(0, 8)} connected`);
    ws.on("message", (data) => {
        let rawMessage;
        try {
            rawMessage = JSON.parse(data.toString());
        }
        catch {
            sendSystemErrorToClient(clientId, "Invalid JSON message", "validation");
            return;
        }
        const parsedMessage = WsMessageSchema.safeParse(rawMessage);
        if (!parsedMessage.success) {
            sendSystemErrorToClient(clientId, formatZodError(parsedMessage.error), "validation");
            return;
        }
        console.log(`[WS] <- ${parsedMessage.data.type}`);
        handleWsMessage(clientId, parsedMessage.data);
    });
    ws.on("close", () => {
        unregisterClient(clientId);
        console.log(`[WS] Client ${clientId.slice(0, 8)} disconnected`);
    });
    ws.send(JSON.stringify({ type: "connected", clientId, timestamp: Date.now() }));
});
const handleWsMessage = (clientId, message) => {
    // Track active LLM server URL for health checks
    if ("lmStudioUrl" in message && typeof message.lmStudioUrl === "string" && message.lmStudioUrl) {
        updateLlmServerUrl(message.lmStudioUrl);
    }
    switch (message.type) {
        case "abort_generation":
            console.log("[WS] Abort requested");
            runWithEventScope({ clientId, requestId: message.requestId }, () => {
                abortAll();
                sendToClient(clientId, { type: "generation_aborted" });
            });
            return;
        case "create_project": {
            console.log("[WS] Create project:", message.description);
            let createOperation = null;
            const eventScope = { requestId: message.requestId };
            runQueuedOperation(clientId, WORKSPACE_OPERATION_QUEUE_KEY, "create_project", "create_project", () => {
                createOperation = createProject({
                    description: message.description,
                    lmStudioUrl: message.lmStudioUrl,
                    model: message.model,
                    plannerModel: message.plannerModel,
                    temperature: message.temperature,
                    maxTokens: message.maxTokens,
                    requestId: message.requestId,
                    onProjectNameResolved: (projectName) => {
                        eventScope.projectName = projectName;
                        if (createOperation) {
                            attachOperationToQueueKey(getProjectOperationQueueKey(projectName), `create_project:${projectName}`, createOperation);
                        }
                    },
                });
                return createOperation;
            }, (result) => {
                sendToClient(clientId, { type: "project_created", ...result });
            }, eventScope);
            return;
        }
        case "iterate":
            console.log("[WS] Iterate:", message.projectName);
            runQueuedOperation(clientId, getProjectOperationQueueKey(message.projectName), `iterate:${message.projectName}`, "iterate", () => iterateProject({
                projectName: message.projectName,
                userRequest: message.userRequest,
                chatHistory: message.chatHistory,
                lmStudioUrl: message.lmStudioUrl,
                model: message.model,
                temperature: message.temperature,
                maxTokens: message.maxTokens,
                requestId: message.requestId,
            }), (result) => {
                sendToClient(clientId, { type: "iteration_result", ...result });
            }, { projectName: message.projectName, requestId: message.requestId });
            return;
        case "start_preview": {
            console.log("[WS] Start preview:", message.projectName);
            const buildId = crypto.randomUUID();
            const previewEventScope = {
                clientId,
                projectName: message.projectName,
                requestId: message.requestId,
            };
            const emitPreviewEvent = (payload) => {
                broadcast({
                    ...payload,
                    projectName: message.projectName,
                    requestId: message.requestId,
                }, previewEventScope);
            };
            const emitBuildScopedEvent = (payload) => {
                emitPreviewEvent({ ...payload, buildId });
            };
            // Fast path: if project is already running, health-check then register
            const pName = message.projectName;
            const existingPort = getActivePort(pName);
            if (existingPort) {
                console.log(`[WS] Project ${pName} running on port ${existingPort}, verifying...`);
                emitBuildScopedEvent({
                    type: "preview_status",
                    previewStatus: "starting",
                });
                waitForMetroReady(existingPort, 5)
                    .then((healthy) => runWithEventScope(previewEventScope, () => {
                    if (healthy) {
                        setPreviewPort(pName, existingPort);
                        emitBuildScopedEvent({
                            type: "preview_ready",
                            port: existingPort,
                            proxyUrl: `/preview/${encodeURIComponent(pName)}/`,
                        });
                        emitBuildScopedEvent({
                            type: "preview_status",
                            previewStatus: "ready",
                        });
                        emitBuildScopedEvent({
                            type: "status",
                            status: "ready",
                            previewStatus: "ready",
                        });
                    }
                    else {
                        console.log(`[WS] Port ${existingPort} not healthy for ${pName}`);
                        sendSystemErrorToClient(clientId, `Metro is not responding on port ${existingPort}`, "start_preview", previewEventScope, { buildId });
                        emitBuildScopedEvent({
                            type: "preview_status",
                            previewStatus: "error",
                            error: `Metro is not responding on port ${existingPort}`,
                        });
                        emitBuildScopedEvent({
                            type: "status",
                            status: "error",
                            previewStatus: "error",
                        });
                    }
                }))
                    .catch((error) => runWithEventScope(previewEventScope, () => {
                    const errorMessage = error instanceof Error
                        ? error.message
                        : "Failed to verify preview health";
                    sendSystemErrorToClient(clientId, errorMessage, "start_preview", previewEventScope, { buildId });
                    emitBuildScopedEvent({
                        type: "preview_status",
                        previewStatus: "error",
                        error: errorMessage,
                    });
                    emitBuildScopedEvent({
                        type: "status",
                        status: "error",
                        previewStatus: "error",
                    });
                }));
                return;
            }
            runQueuedOperation(clientId, getProjectOperationQueueKey(message.projectName), `start_preview:${message.projectName}`, "start_preview", async () => {
                if (!projectExists(message.projectName)) {
                    throw new Error(`Project not found: ${message.projectName}`);
                }
                const projectPath = getProjectPath(message.projectName);
                emitBuildScopedEvent({
                    type: "status",
                    status: "building",
                    previewStatus: "starting",
                });
                emitBuildScopedEvent({
                    type: "preview_status",
                    previewStatus: "starting",
                });
                const { port } = await startExpo(message.projectName, projectPath, (event) => {
                    emitBuildScopedEvent({
                        type: "build_event",
                        eventType: event.type,
                        message: event.message,
                        error: event.error,
                        previewStatus: "starting",
                    });
                    if (event.type === "build_error" && event.error) {
                        const parsed = parseMetroError(event.error);
                        if (parsed) {
                            import("./lib/auto-fixer.js")
                                .then(({ autoFix }) => autoFix({
                                projectName: message.projectName,
                                error: {
                                    type: parsed.type,
                                    file: parsed.file,
                                    line: parsed.line,
                                    raw: parsed.raw,
                                },
                                lmStudioUrl: message.lmStudioUrl,
                                model: message.model,
                                maxAttempts: 3,
                                onAttempt: (attempt, max) => emitBuildScopedEvent({
                                    type: "autofix_attempt",
                                    attempt,
                                    maxAttempts: max,
                                }),
                                onFix: (block) => emitBuildScopedEvent({
                                    type: "autofix_block",
                                    filepath: block.filepath,
                                }),
                            }))
                                .then((result) => {
                                if (!result) {
                                    return;
                                }
                                if (result.success) {
                                    emitBuildScopedEvent({
                                        type: "autofix_success",
                                        attempts: result.attempts,
                                    });
                                    return;
                                }
                                emitBuildScopedEvent({
                                    type: "autofix_failed",
                                    attempts: result.attempts,
                                    error: result.lastError,
                                });
                            })
                                .catch((error) => {
                                emitBuildScopedEvent({
                                    type: "system_error",
                                    error: error instanceof Error
                                        ? error.message
                                        : "Failed to run autofix",
                                    step: "autofix",
                                });
                            });
                        }
                    }
                });
                // Wait for Metro to actually accept requests before announcing preview
                const healthy = await waitForMetroReady(port, 40);
                if (healthy) {
                    setPreviewPort(message.projectName, port);
                    emitBuildScopedEvent({
                        type: "preview_ready",
                        port,
                        proxyUrl: `/preview/${encodeURIComponent(message.projectName)}/`,
                    });
                    emitBuildScopedEvent({
                        type: "preview_status",
                        previewStatus: "ready",
                    });
                    emitBuildScopedEvent({
                        type: "status",
                        status: "ready",
                        previewStatus: "ready",
                    });
                }
                else {
                    const errorMessage = `Metro did not become healthy on port ${port}`;
                    sendSystemErrorToClient(clientId, errorMessage, "start_preview", previewEventScope, { buildId });
                    emitBuildScopedEvent({
                        type: "preview_status",
                        previewStatus: "error",
                        error: errorMessage,
                    });
                    emitBuildScopedEvent({
                        type: "status",
                        status: "error",
                        previewStatus: "error",
                    });
                }
            }, undefined, { projectName: message.projectName, requestId: message.requestId });
            return;
        }
        case "revert_version":
            console.log("[WS] Revert:", message.projectName, message.commitHash);
            runQueuedOperation(clientId, getProjectOperationQueueKey(message.projectName), `revert_version:${message.projectName}`, "revert", () => revertVersion(message.projectName, message.commitHash, message.lmStudioUrl, message.requestId), undefined, { projectName: message.projectName, requestId: message.requestId });
            return;
    }
};
// в”Ђв”Ђ LM Studio Health Check в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
export const updateLlmServerUrl = (url) => {
    currentLlmServerUrl = url.trim() || DEFAULT_LM_STUDIO_URL;
};
const checkLlmServer = async () => {
    try {
        const resp = await fetch(`${currentLlmServerUrl}/v1/models`);
        if (resp.ok) {
            broadcast({ type: "llm_server_status", status: "connected" });
        }
        else {
            clearModelCache(currentLlmServerUrl);
            broadcast({ type: "llm_server_status", status: "disconnected" });
        }
    }
    catch {
        clearModelCache(currentLlmServerUrl);
        broadcast({ type: "llm_server_status", status: "disconnected" });
    }
};
// в”Ђв”Ђ Startup в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
const clearLmStudioInterval = () => {
    if (!lmStudioInterval) {
        return;
    }
    clearInterval(lmStudioInterval);
    lmStudioInterval = null;
};
const shutdown = () => {
    if (isShuttingDown) {
        return;
    }
    isShuttingDown = true;
    console.log("[Agent] Shutting down...");
    clearLmStudioInterval();
    abortAll();
    killAll();
    wss.close();
    server.close(() => {
        process.exit(0);
    });
    setTimeout(() => process.exit(0), 1000).unref();
};
server.listen(PORT, HOST, async () => {
    console.log(`[Agent] Server: http://${HOST}:${PORT}`);
    console.log(`[Agent] WebSocket: ws://${HOST}:${PORT}`);
    initTemplateCache().catch((err) => {
        console.error("[Agent] Template cache init failed:", err);
    });
    await checkLlmServer();
    clearLmStudioInterval();
    lmStudioInterval = setInterval(() => {
        void checkLlmServer();
    }, 15000);
});
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
//# sourceMappingURL=server.js.map