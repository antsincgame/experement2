// Orchestrates HTTP, WebSocket, and preview runtime state via a shared event bus to avoid circular imports.
import express from "express";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import { broadcast, handlePreviewRequest, registerClient, sendToClient, setPreviewPort, unregisterClient, } from "./lib/event-bus.js";
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
const PORT = Number(process.env.AGENT_PORT ?? 3100);
const DEFAULT_LM_STUDIO_URL = process.env.LM_STUDIO_URL?.trim() || "http://localhost:1234";
const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });
let lmStudioInterval = null;
let isShuttingDown = false;
app.use(express.json({ limit: "10mb" }));
app.use((_req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type");
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
    const archiver = await import("archiver").catch(() => null);
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
    archive.pipe(res);
    archive.directory(projectPath, name, {
        ignore: ["node_modules/**", ".expo/**", ".git/**"],
    });
    archive.finalize();
});
app.use("/preview", handlePreviewRequest);
// в”Ђв”Ђ WebSocket в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
const sendSystemErrorToClient = (clientId, error, step) => {
    sendToClient(clientId, {
        type: "system_error",
        error,
        step,
    });
};
const runQueuedOperation = (clientId, queueKey, operationName, step, task, onSuccess) => {
    enqueueProjectOperation(queueKey, operationName, task)
        .then((result) => {
        onSuccess?.(result);
    })
        .catch((error) => {
        sendSystemErrorToClient(clientId, error instanceof Error ? error.message : "Unknown error", step);
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
    switch (message.type) {
        case "abort_generation":
            console.log("[WS] Abort requested");
            abortAll();
            broadcast({ type: "generation_aborted" });
            return;
        case "create_project": {
            console.log("[WS] Create project:", message.description);
            let createOperation = null;
            runQueuedOperation(clientId, WORKSPACE_OPERATION_QUEUE_KEY, "create_project", "create_project", () => {
                createOperation = createProject({
                    description: message.description,
                    lmStudioUrl: message.lmStudioUrl,
                    model: message.model,
                    temperature: message.temperature,
                    maxTokens: message.maxTokens,
                    onProjectNameResolved: (projectName) => {
                        if (createOperation) {
                            attachOperationToQueueKey(getProjectOperationQueueKey(projectName), `create_project:${projectName}`, createOperation);
                        }
                    },
                });
                return createOperation;
            }, (result) => {
                broadcast({ type: "project_created", ...result });
            });
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
            }), (result) => {
                broadcast({ type: "iteration_result", ...result });
            });
            return;
        case "start_preview": {
            console.log("[WS] Start preview:", message.projectName);
            // Fast path: if project is already running, just switch the proxy
            const existingPort = getActivePort(message.projectName);
            if (existingPort) {
                console.log(`[WS] Project ${message.projectName} already running on port ${existingPort}, switching proxy`);
                setPreviewPort(existingPort);
                broadcast({ type: "preview_ready", port: existingPort, proxyUrl: "/preview/" });
                broadcast({ type: "status", status: "ready" });
                return;
            }
            runQueuedOperation(clientId, getProjectOperationQueueKey(message.projectName), `start_preview:${message.projectName}`, "start_preview", async () => {
                if (!projectExists(message.projectName)) {
                    throw new Error(`Project not found: ${message.projectName}`);
                }
                const projectPath = getProjectPath(message.projectName);
                broadcast({ type: "status", status: "building" });
                const { port } = await startExpo(message.projectName, projectPath, (event) => {
                    broadcast({
                        type: "build_event",
                        eventType: event.type,
                        message: event.message,
                        error: event.error,
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
                                maxAttempts: 3,
                                onAttempt: (attempt, max) => broadcast({
                                    type: "autofix_attempt",
                                    attempt,
                                    maxAttempts: max,
                                }),
                                onFix: (block) => broadcast({
                                    type: "autofix_block",
                                    filepath: block.filepath,
                                }),
                            }))
                                .then((result) => {
                                if (!result) {
                                    return;
                                }
                                if (result.success) {
                                    broadcast({
                                        type: "autofix_success",
                                        attempts: result.attempts,
                                    });
                                    return;
                                }
                                broadcast({
                                    type: "autofix_failed",
                                    attempts: result.attempts,
                                    error: result.lastError,
                                });
                            })
                                .catch((error) => {
                                broadcast({
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
                setPreviewPort(port);
                broadcast({ type: "preview_ready", port, proxyUrl: "/preview/" });
                broadcast({ type: "status", status: "ready" });
            });
            return;
        }
        case "revert_version":
            console.log("[WS] Revert:", message.projectName, message.commitHash);
            runQueuedOperation(clientId, getProjectOperationQueueKey(message.projectName), `revert_version:${message.projectName}`, "revert", () => revertVersion(message.projectName, message.commitHash, message.lmStudioUrl));
            return;
    }
};
// в”Ђв”Ђ LM Studio Health Check в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
const checkLmStudio = async () => {
    try {
        const resp = await fetch(`${DEFAULT_LM_STUDIO_URL}/v1/models`);
        if (resp.ok) {
            broadcast({ type: "lm_studio_status", status: "connected" });
        }
        else {
            clearModelCache(DEFAULT_LM_STUDIO_URL);
            broadcast({ type: "lm_studio_status", status: "disconnected" });
        }
    }
    catch {
        clearModelCache(DEFAULT_LM_STUDIO_URL);
        broadcast({ type: "lm_studio_status", status: "disconnected" });
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
server.listen(PORT, async () => {
    console.log(`[Agent] Server: http://localhost:${PORT}`);
    console.log(`[Agent] WebSocket: ws://localhost:${PORT}`);
    initTemplateCache().catch((err) => {
        console.error("[Agent] Template cache init failed:", err);
    });
    await checkLmStudio();
    clearLmStudioInterval();
    lmStudioInterval = setInterval(() => {
        void checkLmStudio();
    }, 15000);
});
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
//# sourceMappingURL=server.js.map