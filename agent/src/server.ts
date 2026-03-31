import express from "express";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";

import { projectRouter } from "./routes/project.js";
import { llmRouter } from "./routes/llm.js";
import { processRouter } from "./routes/process.js";
import { initTemplateCache } from "./services/template-cache.js";
import { killAll } from "./services/process-manager.js";
import { abortAll } from "./services/llm-proxy.js";
import { createProject, iterateProject, revertVersion } from "./lib/pipeline.js";
import { createPreviewProxy } from "./services/preview-proxy.js";

const PORT = 3100;
const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

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
  const { name } = req.params;
  const { getProjectPath, projectExists: projExists } = await import("./services/file-manager.js");
  if (!projExists(name)) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  const archiver = await import("archiver" as string).catch(() => null);
  if (!archiver) {
    // Fallback: list files for client-side ZIP
    const { listAllFiles, readFile } = await import("./services/file-manager.js");
    const files = listAllFiles(name);
    const contents: Record<string, string> = {};
    for (const f of files) {
      const c = readFile(name, f);
      if (c) contents[f] = c;
    }
    res.json({ data: contents });
    return;
  }
  const projPath = getProjectPath(name);
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${name}.zip"`);
  const archive = archiver.default("zip", { zlib: { level: 6 } });
  archive.pipe(res);
  archive.directory(projPath, name, { ignore: ["node_modules/**", ".expo/**", ".git/**"] });
  archive.finalize();
});

// Preview proxy — dynamically routes to active Expo port
let activePreviewPort: number | null = null;
let cachedProxy: ReturnType<typeof createPreviewProxy> | null = null;
let cachedProxyPort: number | null = null;

app.use("/preview", (req, res, next) => {
  if (!activePreviewPort) {
    res.status(503).send("No preview available yet. Metro is not running.");
    return;
  }
  // Reuse proxy if port hasn't changed
  if (!cachedProxy || cachedProxyPort !== activePreviewPort) {
    cachedProxy = createPreviewProxy(activePreviewPort);
    cachedProxyPort = activePreviewPort;
  }
  cachedProxy(req, res, next);
});

export const setPreviewPort = (port: number | null) => {
  if (port !== activePreviewPort) {
    cachedProxy = null;
    cachedProxyPort = null;
  }
  activePreviewPort = port;
  console.log(`[Preview] Port set to: ${port}`);
};

// ── WebSocket ────────────────────────────────────────────

interface WsClient {
  ws: WebSocket;
  id: string;
}

const clients = new Map<string, WsClient>();

const broadcast = (message: Record<string, unknown>): void => {
  const data = JSON.stringify(message);
  for (const client of clients.values()) {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(data);
    }
  }
};

wss.on("connection", (ws: WebSocket) => {
  const clientId = crypto.randomUUID();
  clients.set(clientId, { ws, id: clientId });
  console.log(`[WS] Client ${clientId.slice(0, 8)} connected`);

  ws.on("message", (data: Buffer) => {
    try {
      const message = JSON.parse(data.toString()) as {
        type: string;
        [key: string]: unknown;
      };
      console.log(`[WS] ← ${message.type}`);
      handleWsMessage(clientId, message);
    } catch {
      console.error("[WS] Invalid message format");
    }
  });

  ws.on("close", () => {
    clients.delete(clientId);
    console.log(`[WS] Client ${clientId.slice(0, 8)} disconnected`);
  });

  ws.send(JSON.stringify({ type: "connected", clientId, timestamp: Date.now() }));
});

const handleWsMessage = (
  _clientId: string,
  message: { type: string; [key: string]: unknown }
): void => {
  switch (message.type) {
    case "abort_generation":
      console.log("[WS] Abort requested");
      abortAll();
      broadcast({ type: "generation_aborted" });
      break;

    case "create_project":
      console.log("[WS] Create project:", message.description);
      createProject({
        description: message.description as string,
        lmStudioUrl: message.lmStudioUrl as string | undefined,
      })
        .then((result) =>
          broadcast({ type: "project_created", ...result })
        )
        .catch((err) =>
          broadcast({
            type: "system_error",
            error: err instanceof Error ? err.message : "Unknown error",
            step: "create_project",
          })
        );
      break;

    case "iterate":
      console.log("[WS] Iterate:", message.projectName);
      iterateProject({
        projectName: message.projectName as string,
        userRequest: message.userRequest as string,
        chatHistory: (message.chatHistory as Array<{ role: "user" | "assistant"; content: string }>) ?? [],
        lmStudioUrl: message.lmStudioUrl as string | undefined,
      })
        .then((result) =>
          broadcast({ type: "iteration_result", ...result })
        )
        .catch((err) =>
          broadcast({
            type: "system_error",
            error: err instanceof Error ? err.message : "Unknown error",
            step: "iterate",
          })
        );
      break;

    case "revert_version":
      console.log("[WS] Revert:", message.projectName, message.commitHash);
      revertVersion(
        message.projectName as string,
        message.commitHash as string,
        message.lmStudioUrl as string | undefined
      ).catch((err) =>
        broadcast({
          type: "system_error",
          error: err instanceof Error ? err.message : "Unknown error",
          step: "revert",
        })
      );
      break;

    default:
      console.log(`[WS] Unknown message type: ${message.type}`);
  }
};

export { broadcast, wss };

// ── LM Studio Health Check ───────────────────────────────

const checkLmStudio = async (): Promise<void> => {
  try {
    const resp = await fetch("http://localhost:1234/v1/models");
    if (resp.ok) {
      broadcast({ type: "lm_studio_status", status: "connected" });
    } else {
      broadcast({ type: "lm_studio_status", status: "disconnected" });
    }
  } catch {
    broadcast({ type: "lm_studio_status", status: "disconnected" });
  }
};

// ── Startup ──────────────────────────────────────────────

server.listen(PORT, async () => {
  console.log(`[Agent] ⚡ Server: http://localhost:${PORT}`);
  console.log(`[Agent] ⚡ WebSocket: ws://localhost:${PORT}`);

  initTemplateCache().catch((err) => {
    console.error("[Agent] Template cache init failed:", err);
  });

  checkLmStudio();
  setInterval(checkLmStudio, 15000);
});

process.on("SIGINT", () => {
  console.log("[Agent] Shutting down...");
  killAll();
  server.close();
  process.exit(0);
});
