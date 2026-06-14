// Orchestrates HTTP, WebSocket, and preview runtime state with explicit build scope for each client flow.
import express, { type NextFunction, type Request, type Response } from "express";
import { createServer, type IncomingMessage } from "http";
import { WebSocketServer, WebSocket } from "ws";

import {
  broadcast,
  type EventScope,
  handlePreviewRequest,
  registerClient,
  runWithEventScope,
  sendToClient,
  setPreviewAccessHook,
  setPreviewPort,
  unregisterClient,
} from "./lib/event-bus.js";
import { formatZodError } from "./lib/request-validation.js";
import { assertLlmUrl, llmFetch } from "./lib/llm-url.js";
import { getAllowedOrigins, isOriginAllowed } from "./lib/origin-allowlist.js";
import { describeInsecureBind, isLocalAuthEnabled, verifyHttpToken, verifyWsToken } from "./lib/local-auth.js";
import { createProject, iterateProject, revertVersion } from "./lib/pipeline.js";
import { resumeProjectGeneration } from "./lib/resume-generation.js";
import type { CodegenShipResult } from "./lib/pipeline-codegen-phase.js";
import { withRouting, type OutboundMessage } from "./lib/ws-contract.js";
import { isErrorReported } from "./lib/reported-error.js";
import { triggerMetroBuild, waitForMetroReady } from "./lib/metro-ready.js";
import { resolveFixModel } from "./lib/model-roles.js";
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
import { warnCaught } from "./lib/catch-log.js";
import {
  attachOperationToQueueKey,
  enqueueProjectOperation,
  getProjectOperationQueueKey,
  WORKSPACE_OPERATION_QUEUE_KEY,
} from "./services/project-operation-lock.js";
import {
  killAll,
  killOrphanedPreviewProcesses,
  startExpo,
  getActivePort,
  touchPreview,
  evictIdlePreviews,
} from "./services/process-manager.js";
import { initTemplateCache } from "./services/template-cache.js";


const PORT = Number(process.env.AGENT_PORT ?? 3100);
const HOST = process.env.AGENT_HOST?.trim() || "127.0.0.1";
const DEFAULT_LM_STUDIO_URL = process.env.LM_STUDIO_URL?.trim() || "http://localhost:1234";
const MAX_WS_PAYLOAD_BYTES = 1024 * 1024;
const ALLOWED_ORIGINS = getAllowedOrigins();
const app = express();
const server = createServer(app);
const wss = new WebSocketServer({
  server,
  maxPayload: MAX_WS_PAYLOAD_BYTES,
  perMessageDeflate: false,
  // Reject cross-site WebSocket upgrades: browsers don't enforce same-origin for
  // WS, so a malicious page could otherwise drive create/iterate/revert. The Origin
  // header (always sent by browsers) is checked against the same allowlist as CORS.
  verifyClient: (info: { origin: string; secure: boolean; req: IncomingMessage }) => {
    if (!isOriginAllowed(info.origin, ALLOWED_ORIGINS)) {
      console.warn(`[WS] Rejected upgrade from disallowed origin: ${info.origin}`);
      return false;
    }
    if (!verifyWsToken(info.req)) {
      console.warn("[WS] Rejected upgrade: missing or invalid AGENT_LOCAL_TOKEN");
      return false;
    }
    return true;
  },
});
let lmStudioInterval: NodeJS.Timeout | null = null;
let isShuttingDown = false;
let currentLlmServerUrl = DEFAULT_LM_STUDIO_URL;

app.use(express.json({ limit: "10mb" }));

const ALLOWED_HEADERS = ["Content-Type", "X-App-Factory-Confirm", "X-Agent-Token", "Authorization"];
type ArchiverFactory = (
  format: string,
  options?: { zlib?: { level?: number } }
) => {
  abort: () => void;
  directory: (dirpath: string, destpath: string, data?: { ignore?: string[] }) => void;
  finalize: () => Promise<void>;
  once: (event: string, listener: (error: unknown) => void) => void;
  pipe: (stream: NodeJS.WritableStream) => void;
};

const importModule = new Function(
  "specifier",
  "return import(specifier);"
) as (specifier: string) => Promise<unknown>;

const loadArchiver = async (): Promise<{ default: ArchiverFactory } | null> => {
  try {
    return await importModule("archiver") as { default: ArchiverFactory };
  } catch (error) {
    warnCaught("server", error, "load archiver module");
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

app.use((req, res, next) => {
  if (!isLocalAuthEnabled() || req.path === "/health") {
    next();
    return;
  }
  if (!verifyHttpToken(req)) {
    res.status(401).json({ error: "Unauthorized", code: "AUTH_REQUIRED" });
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
  let archiveFailed = false;
  const handleArchiveError = (error: unknown): void => {
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
  } catch (error) {
    handleArchiveError(error);
  }
});

// Wire LRU protection: a preview being actively viewed (proxied) is kept hot so a
// new project's bundler evicts a truly idle one instead of the one on screen.
setPreviewAccessHook(touchPreview);
// Idle-eviction backstop: free RAM from previews left unviewed too long. Unref'd so
// it never keeps the process alive past shutdown.
setInterval(() => evictIdlePreviews(), 60_000).unref();
app.use("/preview", handlePreviewRequest);

// Last-resort JSON error handler: catches synchronous throws in route handlers
// so Express does not return its default HTML stack trace (internal leak).
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const message = err instanceof Error ? err.message : "Internal server error";
  console.error("[server] Unhandled route error:", message);
  if (res.headersSent) {
    res.destroy(err instanceof Error ? err : undefined);
    return;
  }
  res.status(500).json({ error: message, code: "INTERNAL_ERROR" });
});

// в”Ђв”Ђ WebSocket в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

/** Full create_project often exceeds 10m; env override for slow local LLMs. */
const CREATE_PROJECT_QUEUE_TIMEOUT_MS = Number(
  process.env.CREATE_PROJECT_QUEUE_TIMEOUT_MS ?? "1800000",
);

const CREATE_PROJECT_STILL_RUNNING_NOTICE =
  "Queue time limit reached — generation is still running on the agent. Watch file progress and preview; ignore the red timeout card.";

/** Only announce project_created when preview actually shipped — avoids false "ready". */
const sendProjectCreatedIfShipped = (
  clientId: string,
  result: CodegenShipResult,
  scope?: Record<string, unknown>,
): void => {
  if (result.shipped) {
    sendToClient(clientId, { type: "project_created", ...result }, scope);
    return;
  }
  console.log(
    `[WS] Pipeline finished without ship for ${result.projectName}` +
      (result.failureStage ? ` (${result.failureStage})` : ""),
  );
};

const isOperationQueueTimeout = (error: unknown): boolean =>
  error instanceof Error && /^Operation .+ timed out after \d+s$/i.test(error.message);

const sendSystemErrorToClient = (
  clientId: string,
  error: string,
  step: string,
  scope?: EventScope,
  extra: Record<string, unknown> = {}
): void => {
  sendToClient(clientId, {
    type: "system_error",
    error,
    step,
    ...extra,
  }, scope);
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
      // A deep handler (e.g. the create pipeline) may have already surfaced this
      // error to the client with full context; avoid a duplicate system_error.
      if (isErrorReported(error)) {
        return;
      }
      runWithEventScope(eventScope, () => {
        sendSystemErrorToClient(
          clientId,
          error instanceof Error ? error.message : "Unknown error",
          step,
          eventScope
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
    } catch (error) {
      warnCaught("server", error, "parse WebSocket message JSON");
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

// Guards against duplicate mutating requests (reconnect flushes, double clicks)
// that would otherwise enqueue several identical create/iterate operations.
const processedMutationRequests = new Set<string>();
// The four mutating commands that carry a requestId and are deduped. This union is
// also the exact domain of mutation_duplicate.originalType in the outbound contract,
// so isMutationType lets the compiler prove the echoed type is valid.
type MutationType = "create_project" | "resume_generation" | "iterate" | "revert_version";
const MUTATION_DEDUPE_TYPES = new Set<MutationType>([
  "create_project",
  "resume_generation",
  "iterate",
  "revert_version",
]);

const isMutationType = (type: string): type is MutationType =>
  MUTATION_DEDUPE_TYPES.has(type as MutationType);

const isDuplicateMutation = (message: WsMessage): boolean => {
  if (!isMutationType(message.type)) {
    return false;
  }
  const requestId = "requestId" in message ? message.requestId : undefined;
  if (!requestId) {
    return false;
  }
  if (processedMutationRequests.has(requestId)) {
    return true;
  }
  processedMutationRequests.add(requestId);
  // Bound memory: keep only the most recent identifiers.
  if (processedMutationRequests.size > 200) {
    const oldest = processedMutationRequests.values().next().value;
    if (oldest) {
      processedMutationRequests.delete(oldest);
    }
  }
  return false;
};

const handleWsMessage = (clientId: string, message: WsMessage): void => {
  // Track active LLM server URL for health checks
  if ("lmStudioUrl" in message && typeof message.lmStudioUrl === "string" && message.lmStudioUrl) {
    updateLlmServerUrl(message.lmStudioUrl);
  }

  if (isDuplicateMutation(message)) {
    const requestId = "requestId" in message ? message.requestId : undefined;
    console.log(`[WS] Ignoring duplicate ${message.type} (requestId already processed)`);
    if (requestId && isMutationType(message.type)) {
      sendToClient(clientId, {
        type: "mutation_duplicate",
        requestId,
        originalType: message.type,
      });
    }
    return;
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

      const finishCreate = (result: Awaited<ReturnType<typeof createProject>>): void => {
        runWithEventScope(
          { clientId, projectName: result.projectName, requestId: message.requestId },
          () => {
            sendProjectCreatedIfShipped(clientId, result, {
              clientId,
              projectName: result.projectName,
              requestId: message.requestId,
            });
          },
        );
      };

      const runCreateTask = (): Promise<Awaited<ReturnType<typeof createProject>>> =>
        runWithEventScope(eventScope, () => {
          createOperation = createProject({
            description: message.description,
            lmStudioUrl: message.lmStudioUrl,
            model: message.model,
            plannerModel: message.plannerModel,
            editorModel: message.editorModel,
            embeddingModel: message.embeddingModel,
            semanticRagEnabled: message.semanticRagEnabled,
            autoPolishEnabled: message.autoPolishEnabled,
            autoPolishMaxPasses: message.autoPolishMaxPasses,
            polishModel: message.polishModel,
            temperature: message.temperature,
            maxTokens: message.maxTokens,
            topP: message.topP,
            requestId: message.requestId,
            onProjectNameResolved: (projectName) => {
              eventScope.projectName = projectName;
              if (createOperation) {
                attachOperationToQueueKey(
                  getProjectOperationQueueKey(projectName),
                  `create_project:${projectName}`,
                  createOperation,
                );
              }
            },
          });
          return createOperation;
        });

      void enqueueProjectOperation(
        WORKSPACE_OPERATION_QUEUE_KEY,
        "create_project",
        runCreateTask,
        { timeoutMs: CREATE_PROJECT_QUEUE_TIMEOUT_MS },
      )
        .then(finishCreate)
        .catch(async (error) => {
          if (isErrorReported(error)) {
            return;
          }

          if (isOperationQueueTimeout(error) && createOperation) {
            console.warn(
              "[WS] create_project queue timeout — awaiting in-flight pipeline",
            );
            runWithEventScope(
              { clientId, projectName: eventScope.projectName, requestId: message.requestId },
              () => {
                sendToClient(
                  clientId,
                  {
                    type: "build_event",
                    eventType: "pipeline_notice",
                    message: CREATE_PROJECT_STILL_RUNNING_NOTICE,
                    requestId: message.requestId,
                    projectName: eventScope.projectName,
                  },
                  eventScope,
                );
              },
            );
            try {
              finishCreate(await createOperation);
            } catch (inner) {
              if (!isErrorReported(inner)) {
                runWithEventScope(eventScope, () => {
                  sendSystemErrorToClient(
                    clientId,
                    inner instanceof Error ? inner.message : String(inner),
                    "create_project",
                    eventScope,
                  );
                });
              }
            }
            return;
          }

          runWithEventScope(eventScope, () => {
            sendSystemErrorToClient(
              clientId,
              error instanceof Error ? error.message : "Unknown error",
              "create_project",
              eventScope,
            );
          });
        });
      return;
    }

    case "resume_generation": {
      console.log("[WS] Resume generation:", message.projectName);
      runQueuedOperation(
        clientId,
        getProjectOperationQueueKey(message.projectName),
        `resume_generation:${message.projectName}`,
        "resume_generation",
        () =>
          resumeProjectGeneration({
            projectName: message.projectName,
            lmStudioUrl: message.lmStudioUrl,
            model: message.model,
            editorModel: message.editorModel,
            embeddingModel: message.embeddingModel,
            semanticRagEnabled: message.semanticRagEnabled,
            autoPolishEnabled: message.autoPolishEnabled,
            autoPolishMaxPasses: message.autoPolishMaxPasses,
            polishModel: message.polishModel,
            temperature: message.temperature,
            maxTokens: message.maxTokens,
            topP: message.topP,
            requestId: message.requestId,
          }),
        (result) => {
          sendProjectCreatedIfShipped(clientId, result, {
            clientId,
            projectName: message.projectName,
            requestId: message.requestId,
          });
        },
        { projectName: message.projectName, requestId: message.requestId },
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
          editorModel: message.editorModel,
          temperature: message.temperature,
          maxTokens: message.maxTokens,
          topP: message.topP,
          requestId: message.requestId,
        }),
        (result) => {
          sendToClient(clientId, { type: "iteration_result", ...result });
        },
        { projectName: message.projectName, requestId: message.requestId }
      );
      return;

    case "start_preview": {
      console.log("[WS] Start preview:", message.projectName);
      const buildId = crypto.randomUUID();
      const previewEventScope = {
        clientId,
        projectName: message.projectName,
        requestId: message.requestId,
      };
      const emitPreviewEvent = (payload: OutboundMessage): void => {
        broadcast(
          withRouting(payload, { projectName: message.projectName, requestId: message.requestId }),
          previewEventScope,
        );
      };
      const emitBuildScopedEvent = (payload: OutboundMessage): void => {
        emitPreviewEvent(withRouting(payload, { buildId }));
      };

      const pName = message.projectName as string;
      const announceReady = (port: number): void => {
        setPreviewPort(pName, port);
        emitBuildScopedEvent({
          type: "preview_ready",
          port,
          proxyUrl: `/preview/${encodeURIComponent(pName)}/`,
        });
        emitBuildScopedEvent({ type: "preview_status", previewStatus: "ready" });
        emitBuildScopedEvent({ type: "status", status: "ready", previewStatus: "ready" });
      };
      const announceUnhealthy = (errorMessage: string): void => {
        sendSystemErrorToClient(clientId, errorMessage, "start_preview", previewEventScope, { buildId });
        emitBuildScopedEvent({ type: "preview_status", previewStatus: "error", error: errorMessage });
        emitBuildScopedEvent({ type: "status", status: "error", previewStatus: "error" });
      };

      // Run BOTH the already-running re-attach AND the cold start through the
      // per-project queue, so a concurrent iterate/revert on this project (which
      // calls the singleton killAll) cannot kill the bundler between the health
      // check and the preview_ready we announce.
      runQueuedOperation(
        clientId,
        getProjectOperationQueueKey(message.projectName),
        `start_preview:${message.projectName}`,
        "start_preview",
        async () => {
          // Fast path: project already running — health-check and re-attach.
          const existingPort = getActivePort(pName);
          if (existingPort) {
            console.log(`[WS] Project ${pName} running on port ${existingPort}, verifying...`);
            emitBuildScopedEvent({ type: "preview_status", previewStatus: "starting" });
            // A tracked port can still be mid-bundle (Expo + Tamagui first build
            // takes tens of seconds), so allow the full ready window.
            if (await waitForMetroReady(existingPort, 60)) {
              announceReady(existingPort);
            } else {
              console.log(`[WS] Port ${existingPort} not healthy for ${pName}`);
              announceUnhealthy(`Metro is not responding on port ${existingPort}`);
            }
            return;
          }

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
                    model: resolveFixModel(message.editorModel, message.model),
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

          // Expo web bundles lazily; fire the first request so compilation starts
          // instead of waiting for a request that never comes.
          void triggerMetroBuild(port).catch((error) => {
            warnCaught("server", error, "triggerMetroBuild after preview start");
          });

          // Wait for Metro to actually accept requests before announcing preview.
          // First Expo + Tamagui bundle can take well over 30s on a cold start.
          if (await waitForMetroReady(port, 60)) {
            announceReady(port);
          } else {
            announceUnhealthy(`Metro did not become healthy on port ${port}`);
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
          message.lmStudioUrl,
          message.requestId
        ),
        undefined,
        { projectName: message.projectName, requestId: message.requestId }
      );
      return;
  }
};

// в”Ђв”Ђ LM Studio Health Check в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

export const updateLlmServerUrl = (url: string): void => {
  const trimmed = url.trim();
  if (!trimmed) {
    currentLlmServerUrl = DEFAULT_LM_STUDIO_URL;
    return;
  }
  try {
    currentLlmServerUrl = assertLlmUrl(trimmed);
  } catch (err) {
    // Reject SSRF-style URLs from clients; keep the current (trusted) value.
    console.warn(
      `[server] Ignoring disallowed LLM URL: ${err instanceof Error ? err.message : err}`
    );
  }
};

const checkLlmServer = async (): Promise<void> => {
  try {
    const resp = await llmFetch(`${currentLlmServerUrl}/v1/models`);
    if (resp.ok) {
      broadcast({ type: "llm_server_status", status: "connected" });
    } else {
      clearModelCache(currentLlmServerUrl);
      broadcast({ type: "llm_server_status", status: "disconnected" });
    }
  } catch (error) {
    warnCaught("server", error, "check LLM server status");
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

server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `[Agent] Port ${PORT} is already in use. Stop the other agent process or set AGENT_PORT.`
    );
  } else {
    console.error("[Agent] Server error:", err.message);
  }
  process.exit(1);
});

server.listen(PORT, HOST, async () => {
  console.log(`[Agent] Server: http://${HOST}:${PORT}`);
  console.log(`[Agent] WebSocket: ws://${HOST}:${PORT}`);

  const insecureBind = describeInsecureBind(HOST, isLocalAuthEnabled());
  if (insecureBind) {
    console.warn(`[Agent] ⚠️  SECURITY: ${insecureBind}`);
  }

  // Reclaim preview bundlers orphaned by a previous run before accepting work.
  killOrphanedPreviewProcesses();

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

