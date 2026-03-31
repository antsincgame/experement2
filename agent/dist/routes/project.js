// Validates project route params and file paths before touching the workspace.
import { Router } from "express";
import fs from "fs";
import path from "path";
import { parseOrRespond } from "../lib/request-validation.js";
import { ProjectFileQuerySchema, ProjectParamsSchema, } from "../schemas/runtime-input.schema.js";
import { getFileTree, readFile, listAllFiles, projectExists, getWorkspaceRoot, } from "../services/file-manager.js";
export const projectRouter = Router();
projectRouter.get("/", (_req, res) => {
    const wsRoot = getWorkspaceRoot();
    if (!fs.existsSync(wsRoot)) {
        res.json({ data: [] });
        return;
    }
    const entries = fs.readdirSync(wsRoot, { withFileTypes: true });
    const projects = entries
        .filter((entry) => (entry.isDirectory() &&
        entry.name !== "template_cache" &&
        !entry.name.startsWith(".")))
        .map((entry) => ({
        name: entry.name,
        displayName: entry.name,
        createdAt: fs.statSync(path.join(wsRoot, entry.name)).birthtimeMs,
    }))
        .sort((left, right) => right.createdAt - left.createdAt);
    res.json({ data: projects });
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
    }
    catch (error) {
        res.status(400).json({
            error: error instanceof Error ? error.message : "Invalid project path",
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
    }
    catch (error) {
        res.status(400).json({
            error: error instanceof Error ? error.message : "Invalid file path",
            code: "INVALID_INPUT",
        });
    }
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
    }
    catch (error) {
        res.status(400).json({
            error: error instanceof Error ? error.message : "Invalid project path",
            code: "INVALID_INPUT",
        });
    }
});
//# sourceMappingURL=project.js.map