import { Router } from "express";
import {
  getFileTree,
  readFile,
  listAllFiles,
  projectExists,
} from "../services/file-manager.js";

export const projectRouter = Router();

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
  const filePath = req.query.path as string | undefined;

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
