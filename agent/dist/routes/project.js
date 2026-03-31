import { Router } from "express";
import fs from "fs";
import path from "path";
import { getFileTree, readFile, listAllFiles, projectExists, getWorkspaceRoot, } from "../services/file-manager.js";
export const projectRouter = Router();
// List all projects in workspace (for sidebar on Welcome screen)
projectRouter.get("/", (_req, res) => {
    const wsRoot = getWorkspaceRoot();
    if (!fs.existsSync(wsRoot)) {
        res.json({ data: [] });
        return;
    }
    const entries = fs.readdirSync(wsRoot, { withFileTypes: true });
    const projects = entries
        .filter((e) => e.isDirectory() && e.name !== "template_cache" && !e.name.startsWith("."))
        .map((e) => {
        const pkgPath = path.join(wsRoot, e.name, "package.json");
        let displayName = e.name;
        try {
            const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
            displayName = pkg.displayName ?? pkg.name ?? e.name;
        }
        catch { /* no package.json */ }
        return { name: e.name, displayName, createdAt: fs.statSync(path.join(wsRoot, e.name)).birthtimeMs };
    })
        .sort((a, b) => b.createdAt - a.createdAt);
    res.json({ data: projects });
});
projectRouter.get("/:name/files", (req, res) => {
    const { name } = req.params;
    if (!projectExists(name)) {
        res.status(404).json({ error: "Project not found", code: "NOT_FOUND" });
        return;
    }
    const tree = getFileTree(name);
    res.json({ data: tree });
});
projectRouter.get("/:name/file", (req, res) => {
    const { name } = req.params;
    const filePath = req.query.path;
    if (!filePath) {
        res.status(400).json({ error: "path query required", code: "INVALID_INPUT" });
        return;
    }
    if (!projectExists(name)) {
        res.status(404).json({ error: "Project not found", code: "NOT_FOUND" });
        return;
    }
    const content = readFile(name, filePath);
    if (content === null) {
        res.status(404).json({ error: "File not found", code: "FILE_NOT_FOUND" });
        return;
    }
    res.json({ data: { path: filePath, content } });
});
projectRouter.get("/:name/all-files", (req, res) => {
    const { name } = req.params;
    if (!projectExists(name)) {
        res.status(404).json({ error: "Project not found", code: "NOT_FOUND" });
        return;
    }
    const files = listAllFiles(name);
    res.json({ data: files });
});
//# sourceMappingURL=project.js.map