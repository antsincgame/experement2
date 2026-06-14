// Validates project routes and protects destructive workspace operations with explicit confirmation.
import { Router } from "express";
import fs from "fs";
import path from "path";
import {
  DELETE_WORKSPACE_CONFIRMATION,
  requireDangerousAction,
} from "../lib/route-guards.js";
import { parseOrRespond } from "../lib/request-validation.js";
import {
  ProjectFileQuerySchema,
  ProjectFileWriteSchema,
  ProjectParamsSchema,
} from "../schemas/runtime-input.schema.js";
import { getProjectResumeStatus } from "../lib/generation-state.js";
import { loadPlanBlueprint, loadPlanBrief } from "../lib/plan-artifact.js";
import {
  getFileTree,
  readFile,
  writeFile,
  listAllFiles,
  projectExists,
  getWorkspaceRoot,
  deleteAllWorkspaceProjects,
} from "../services/file-manager.js";
import { killAll, killExpo } from "../services/process-manager.js";

export const projectRouter = Router();

projectRouter.get("/", (_req, res) => {
  const wsRoot = getWorkspaceRoot();
  if (!fs.existsSync(wsRoot)) {
    res.json({ data: [] });
    return;
  }

  try {
    const entries = fs.readdirSync(wsRoot, { withFileTypes: true });
    const projects = entries
      .filter((entry) => (
        entry.isDirectory() &&
        entry.name !== "template_cache" &&
        !entry.name.startsWith(".")
      ))
      .map((entry) => {
        const resume = getProjectResumeStatus(entry.name);
        return {
          name: entry.name,
          displayName: entry.name,
          createdAt: fs.statSync(path.join(wsRoot, entry.name)).birthtimeMs,
          canResume: resume.canResume,
          missingFileCount: resume.missingFileCount,
        };
      })
      .sort((left, right) => right.createdAt - left.createdAt);

    res.json({ data: projects });
  } catch (error) {
    // A transient FS fault (e.g. a project removed mid-listing) must not leak
    // a stack trace; report a clean 500 instead.
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to list projects",
      code: "WORKSPACE_READ_FAILED",
    });
  }
});

// DELETE all projects (wipe workspace)
projectRouter.delete("/all", async (req, res) => {
  if (!requireDangerousAction(req, res, DELETE_WORKSPACE_CONFIRMATION, "Workspace deletion")) {
    return;
  }

  const wsRoot = getWorkspaceRoot();
  if (!fs.existsSync(wsRoot)) {
    res.json({ data: { deleted: 0, failed: [] } });
    return;
  }

  try {
    killAll();
    for (const entry of fs.readdirSync(wsRoot, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name === "template_cache" || entry.name.startsWith(".")) {
        continue;
      }
      killExpo(entry.name);
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));

    const result = deleteAllWorkspaceProjects();
    if (result.deleted.length === 0 && result.failed.length > 0) {
      res.status(500).json({
        error: result.failed.map((item) => `${item.name}: ${item.error}`).join("; "),
        code: "WORKSPACE_DELETE_FAILED",
        data: { deleted: 0, failed: result.failed.map((item) => item.name) },
      });
      return;
    }

    res.json({
      data: {
        deleted: result.deleted.length,
        failed: result.failed.map((item) => item.name),
      },
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to delete projects",
      code: "WORKSPACE_DELETE_FAILED",
    });
  }
});

projectRouter.get("/:name/files", (req, res) => {
  const params = parseOrRespond(ProjectParamsSchema, req.params, res);
  if (!params) {
    return;
  }

  if (!projectExists(params.name)) {
    res.status(404).json({ error: "Project not found", code: "NOT_FOUND" });
    return;
  }

  try {
    res.json({ data: getFileTree(params.name) });
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Invalid project path",
      code: "INVALID_INPUT",
    });
  }
});

projectRouter.put("/:name/file", (req, res) => {
  const params = parseOrRespond(ProjectParamsSchema, req.params, res);
  const body = parseOrRespond(ProjectFileWriteSchema, req.body, res);
  if (!params || !body) {
    return;
  }

  if (!projectExists(params.name)) {
    res.status(404).json({ error: "Project not found", code: "NOT_FOUND" });
    return;
  }

  try {
    writeFile(params.name, body.path, body.content);
    res.json({ data: { path: body.path } });
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Invalid file path",
      code: "INVALID_INPUT",
    });
  }
});

projectRouter.get("/:name/file", (req, res) => {
  const params = parseOrRespond(ProjectParamsSchema, req.params, res);
  const query = parseOrRespond(ProjectFileQuerySchema, req.query, res);
  if (!params || !query) {
    return;
  }

  if (!projectExists(params.name)) {
    res.status(404).json({ error: "Project not found", code: "NOT_FOUND" });
    return;
  }

  try {
    const content = readFile(params.name, query.path);
    if (content === null) {
      res.status(404).json({ error: "File not found", code: "FILE_NOT_FOUND" });
      return;
    }

    res.json({ data: { path: query.path, content } });
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Invalid file path",
      code: "INVALID_INPUT",
    });
  }
});

projectRouter.get("/:name/blueprint", (req, res) => {
  const params = parseOrRespond(ProjectParamsSchema, req.params, res);
  if (!params) {
    return;
  }

  if (!projectExists(params.name)) {
    res.status(404).json({ error: "Project not found", code: "NOT_FOUND" });
    return;
  }

  const blueprint = loadPlanBlueprint(params.name);
  if (!blueprint) {
    res.status(404).json({
      error: "No blueprint saved for this project",
      code: "BLUEPRINT_NOT_FOUND",
    });
    return;
  }

  res.json({ data: blueprint });
});

projectRouter.get("/:name/blueprint/brief", (req, res) => {
  const params = parseOrRespond(ProjectParamsSchema, req.params, res);
  if (!params) {
    return;
  }

  if (!projectExists(params.name)) {
    res.status(404).json({ error: "Project not found", code: "NOT_FOUND" });
    return;
  }

  const brief = loadPlanBrief(params.name);
  if (!brief) {
    res.status(404).json({
      error: "No blueprint brief for this project",
      code: "BRIEF_NOT_FOUND",
    });
    return;
  }

  res.json({ data: { format: "markdown", content: brief } });
});

projectRouter.get("/:name/status", (req, res) => {
  const params = parseOrRespond(ProjectParamsSchema, req.params, res);
  if (!params) {
    return;
  }

  if (!projectExists(params.name)) {
    res.status(404).json({ error: "Project not found", code: "NOT_FOUND" });
    return;
  }

  res.json({ data: getProjectResumeStatus(params.name) });
});

projectRouter.get("/:name/all-files", (req, res) => {
  const params = parseOrRespond(ProjectParamsSchema, req.params, res);
  if (!params) {
    return;
  }

  if (!projectExists(params.name)) {
    res.status(404).json({ error: "Project not found", code: "NOT_FOUND" });
    return;
  }

  try {
    res.json({ data: listAllFiles(params.name) });
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Invalid project path",
      code: "INVALID_INPUT",
    });
  }
});
