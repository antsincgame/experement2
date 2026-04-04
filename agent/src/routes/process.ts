// Validates process routes and protects preview process control with explicit confirmation.
import { Router } from "express";
import {
  KILL_PROCESS_CONFIRMATION,
  requireDangerousAction,
} from "../lib/route-guards.js";
import { parseOrRespond } from "../lib/request-validation.js";
import { ProjectParamsSchema } from "../schemas/runtime-input.schema.js";
import {
  isRunning,
  getActivePort,
  killExpo,
} from "../services/process-manager.js";
import { projectExists } from "../services/file-manager.js";

export const processRouter = Router();

processRouter.get("/:name/status", (req, res) => {
  const params = parseOrRespond(ProjectParamsSchema, req.params, res);
  if (!params) {
    return;
  }

  if (!projectExists(params.name)) {
    res.status(404).json({ error: "Project not found", code: "NOT_FOUND" });
    return;
  }

  const running = isRunning(params.name);
  const port = getActivePort(params.name);

  res.json({
    data: {
      running,
      port,
      previewUrl: port ? `/preview/${encodeURIComponent(params.name)}/` : null,
    },
  });
});

processRouter.post("/:name/kill", (req, res) => {
  if (!requireDangerousAction(req, res, KILL_PROCESS_CONFIRMATION, "Preview process kill")) {
    return;
  }

  const params = parseOrRespond(ProjectParamsSchema, req.params, res);
  if (!params) {
    return;
  }

  if (!projectExists(params.name)) {
    res.status(404).json({ error: "Project not found", code: "NOT_FOUND" });
    return;
  }

  killExpo(params.name);
  res.json({ data: { message: "Process killed" } });
});
