// Orchestrates HTTP, WebSocket, and preview runtime state with stricter network boundaries for local-only use.
import express from "express";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";

import {
  broadcast,
  handlePreviewRequest,
  registerClient,
  runWithEventScope,
  sendToClient,
  setPreviewPort,
  unregisterClient,
} from "./lib/event-bus.js";
import { formatZodError } from "./lib/request-validation.js";
import { createProject, iterateProject, revertVersion } from "./lib/pipeline.js";
import { projectRouter } from "./routes/project.js";
import { llmRouter } from "./routes/llm.js";
import { processRouter } from "./routes/process.js";
import {
  ProjectParamsSchema,
  type WsMessage,
  WsMessageSchema,
} from "./schemas/runtime-input.schema.js";
import {
  getProjectPath,
  listAllFiles,
  projectExists,
  readFile,
} from "./services/file-manager.js";
import { abortAll, clearModelCache } from "./services/llm-proxy.js";
import { parseMetroError } from "./services/log-watcher.js";
import {
  attachOperationToQueueKey,
  enqueueProjectOperation,
  getProjectOperationQueueKey,
  WORKSPACE_OPERATION_QUEUE_KEY,
} from "./services/project-operation-lock.js";
import { killAll, startExpo, getActivePort } from "./services/process-manager.js";
import { initTemplateCache } from "./services/template-cache.js";

const waitForMetroReady = async (port: number, maxRetries = 40): Promise<boolean> => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const resp = await fetch(`http://127.0.0.1:${port}`, { signal: AbortSignal.timeout(2000) });
      if (resp.ok) return true;
    } catch { /* Metro not ready yet */ }
    await new Promise((r) => setTimeout(r, 750));
  }
  return false;
};

const PORT = Number(process.env.AGENT_PORT ?? 3100);
const HOST = process.env.AGENT_HOST?.trim() || "127.0.0.1";
const DEFAULT_LM_STUDIO_URL = process.env.LM_STUDIO_URL?.trim() || "http://localhost:1234";
const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });
let lmStudioInterval: NodeJS.Timeout | null = null;
let isShuttingDown = false;
let currentLlmServerUrl = DEFAULT_LM_STUDIO_URL;

app.use(express.json({ limit: "10mb" }));

const ALLOWED_ORIGINS = (
  process.env.AGENT_ALLOWED_ORIGINS
    ?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
  ?? ["http://localhost:8081", "http://localhost:8082", "http://127.0.0.1:8081"]
);
const ALLOWED_HEADERS = ["Content-Type", "X-App-Factory-Confirm"];

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

  const archiver = await import("archiver" as string).catch(() => null);
  if (!archiver) {
    const files = listAllFiles(name);
    const contents: Record<string, string> = {};
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

const sendSystemErrorToClient = (
  clientId: string,
  error: string,
  step: string
): void => {
  sendToClient(clientId, {
    type: "system_error",
    error,
    step,
  });
};

const runQueuedOperation = <T>(
  clientId: string,
  queueKey: string,
  operationName: string,
  step: string,
  task: () => Promise<T>,
  onSuccess?: (result: T) => void,
  scope: { projectName?: string; requestId?: string } = {}
): void => {
  const eventScope = {
    clientId,
    projectName: scope.projectName,
    requestId: scope.requestId,
  };

  enqueueProjectOperation(
    queueKey,
    operationName,
    () => runWithEventScope(eventScope, task)
  )
    .then((result) => {
      runWithEventScope(eventScope, () => {
        onSuccess?.(result);
      });
    })
    .catch((error) => {
      runWithEventScope(eventScope, () => {
        sendSystemErrorToClient(
          clientId,
          error instanceof Error ? error.message : "Unknown error",
          step
        );
      });
    });
};

wss.on("connection", (ws: WebSocket) => {
  const clientId = crypto.randomUUID();
  registerClient(clientId, ws);
  console.log(`[WS] Client ${clientId.slice(0, 8)} connected`);

  ws.on("message", (data: Buffer) => {
    let rawMessage: unknown;

    try {
      rawMessage = JSON.parse(data.toString());
    } catch {
      sendSystemErrorToClient(clientId, "Invalid JSON message", "validation");
      return;
    }

    const parsedMessage = WsMessageSchema.safeParse(rawMessage);
    if (!parsedMessage.success) {
      sendSystemErrorToClient(
        clientId,
        formatZodError(parsedMessage.error),
        "validation"
      );
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

const handleWsMessage = (clientId: string, message: WsMessage): void => {
  // Track active LLM server URL for health checks
  if ("lmStudioUrl" in message && typeof message.lmStudioUrl === "string" && message.lmStudioUrl) {
    updateLlmServerUrl(message.lmStudioUrl);
  }

  switch (message.type) {
    case "abort_generation":
      console.log("[WS] Abort requested");
      runWithEventScope(
        { clientId, requestId: message.requestId },
        () => {
          abortAll();
          sendToClient(clientId, { type: "generation_aborted" });
        }
      );
      return;

    case "create_project": {
      console.log("[WS] Create project:", message.description);
      let createOperation: Promise<Awaited<ReturnType<typeof createProject>>> | null = null;
      const eventScope = { requestId: message.requestId } as {
        projectName?: string;
        requestId?: string;
      };

      runQueuedOperation(
        clientId,
        WORKSPACE_OPERATION_QUEUE_KEY,
        "create_project",
        "create_project",
        () => {
          createOperation = createProject({
            description: message.description,
            lmStudioUrl: message.lmStudioUrl,
            model: message.model,
            temperature: message.temperature,
            maxTokens: message.maxTokens,
            onProjectNameResolved: (projectName) => {
              eventScope.projectName = projectName;
              if (createOperation) {
                attachOperationToQueueKey(
                  getProjectOperationQueueKey(projectName),
                  `create_project:${projectName}`,
                  createOperation
                );
              }
            },
          });

          return createOperation;
        },
        (result) => {
          sendToClient(clientId, { type: "project_created", ...result });
        },
        eventScope
      );
      return;
    }

    case "iterate":
      console.log("[WS] Iterate:", message.projectName);
      runQueuedOperation(
        clientId,
        getProjectOperationQueueKey(message.projectName),
        `iterate:${message.projectName}`,
        "iterate",
        () => iterateProject({
          projectName: message.projectName,
          userRequest: message.userRequest,
          chatHistory: message.chatHistory,
          lmStudioUrl: message.lmStudioUrl,
          model: message.model,
          temperature: message.temperature,
          maxTokens: message.maxTokens,
        }),
        (result) => {
          sendToClient(clientId, { type: "iteration_result", ...result });
        },
        { projectName: message.projectName, requestId: message.requestId }
      );
      return;

    case "start_preview": {
      console.log("[WS] Start preview:", message.projectName);

      // Fast path: if project is already running, health-check then register
      const pName = message.projectName as string;
      const existingPort = getActivePort(pName);
      if (existingPort) {
        console.log(`[WS] Project ${pName} running on port ${existingPort}, verifying...`);
        waitForMetroReady(existingPort, 5).then((healthy) => {
          runWithEventScope(
            { clientId, projectName: pName, requestId: message.requestId },
            () => {
              if (healthy) {
                setPreviewPort(pName, existingPort);
                broadcast({ type: "preview_ready", port: existingPort, projectName: pName, proxyUrl: `/preview/${encodeURIComponent(pName)}/` });
                broadcast({ type: "status", status: "ready" });
              } else {
                console.log(`[WS] Port ${existingPort} not healthy for ${pName}`);
                sendSystemErrorToClient(clientId, `Metro is not responding on port ${existingPort}`, "start_preview");
                broadcast({ type: "status", status: "error" });
              }
            }
          );
        });
        return;
      }

      runQueuedOperation(
        clientId,
        getProjectOperationQueueKey(message.projectName),
        `start_preview:${message.projectName}`,
        "start_preview",
        async () => {
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

          // Wait for Metro to actually accept requests before announcing preview
          const healthy = await waitForMetroReady(port, 40);

          setPreviewPort(message.projectName as string, port);
          if (healthy) {
            broadcast({ type: "preview_ready", port, projectName: message.projectName, proxyUrl: `/preview/${encodeURIComponent(message.projectName as string)}/` });
            broadcast({ type: "status", status: "ready" });
          } else {
            sendSystemErrorToClient(clientId, `Metro did not become healthy on port ${port}`, "start_preview");
            broadcast({ type: "status", status: "error" });
          }
        },
        undefined,
        { projectName: message.projectName, requestId: message.requestId }
      );
      return;
    }

    case "revert_version":
      console.log("[WS] Revert:", message.projectName, message.commitHash);
      runQueuedOperation(
        clientId,
        getProjectOperationQueueKey(message.projectName),
        `revert_version:${message.projectName}`,
        "revert",
        () => revertVersion(
          message.projectName,
          message.commitHash,
          message.lmStudioUrl
        ),
        undefined,
        { projectName: message.projectName, requestId: message.requestId }
      );
      return;
  }
};

// в”Ђв”Ђ LM Studio Health Check в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

export const updateLlmServerUrl = (url: string): void => {
  currentLlmServerUrl = url.trim() || DEFAULT_LM_STUDIO_URL;
};

const checkLlmServer = async (): Promise<void> => {
  try {
    const resp = await fetch(`${currentLlmServerUrl}/v1/models`);
    if (resp.ok) {
      broadcast({ type: "llm_server_status", status: "connected" });
    } else {
      clearModelCache(currentLlmServerUrl);
      broadcast({ type: "llm_server_status", status: "disconnected" });
    }
  } catch {
    clearModelCache(currentLlmServerUrl);
    broadcast({ type: "llm_server_status", status: "disconnected" });
  }
};

// в”Ђв”Ђ Startup в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

const clearLmStudioInterval = (): void => {
  if (!lmStudioInterval) {
    return;
  }

  clearInterval(lmStudioInterval);
  lmStudioInterval = null;
};

const shutdown = (): void => {
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

