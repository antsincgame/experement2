// Resolves workspace paths safely so project file access cannot escape the workspace root.
import fs from "fs";
import path from "path";
import { warnCaught } from "../lib/catch-log.js";

const WORKSPACE_ROOT = path.resolve(process.cwd(), "../workspace");

const ensureDir = (filepath: string): void => {
  fs.mkdirSync(path.dirname(filepath), { recursive: true });
};

const assertProjectName = (projectName: string): string => {
  const trimmed = projectName.trim();
  if (!trimmed) {
    throw new Error("Project name is required");
  }
  if (trimmed !== path.basename(trimmed) || trimmed === "." || trimmed === "..") {
    throw new Error(`Invalid project name: ${projectName}`);
  }
  if (trimmed.includes("\0")) {
    throw new Error(`Invalid project name: ${projectName}`);
  }
  return trimmed;
};

const assertRelativeProjectPath = (filePath: string): string => {
  const trimmed = filePath.trim();
  if (!trimmed) {
    throw new Error("File path is required");
  }
  if (path.isAbsolute(trimmed) || trimmed.includes("\0")) {
    throw new Error(`Invalid file path: ${filePath}`);
  }
  return trimmed;
};

const assertWithinRoot = (rootPath: string, candidatePath: string): void => {
  const relativePath = path.relative(rootPath, candidatePath);
  if (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
  ) {
    return;
  }
  throw new Error(`Resolved path escapes allowed root: ${candidatePath}`);
};

const assertWorkspacePath = (candidatePath: string): string => {
  const resolvedPath = path.resolve(candidatePath);
  assertWithinRoot(WORKSPACE_ROOT, resolvedPath);
  return resolvedPath;
};

export const safeResolveUnderRoot = (...segments: string[]): string => {
  const resolvedPath = path.resolve(WORKSPACE_ROOT, ...segments);
  assertWithinRoot(WORKSPACE_ROOT, resolvedPath);
  return resolvedPath;
};

const resolveProjectPath = (projectName: string, filePath: string): string => {
  const projectRoot = getProjectPath(projectName);
  const resolvedPath = path.resolve(
    projectRoot,
    assertRelativeProjectPath(filePath)
  );
  assertWithinRoot(projectRoot, resolvedPath);
  return resolvedPath;
};

export const writeFile = (
  projectName: string,
  filePath: string,
  content: string
): void => {
  const fullPath = resolveProjectPath(projectName, filePath);
  ensureDir(fullPath);
  fs.writeFileSync(fullPath, content, "utf-8");
};

export const readFile = (
  projectName: string,
  filePath: string
): string | null => {
  const fullPath = resolveProjectPath(projectName, filePath);
  if (!fs.existsSync(fullPath)) return null;
  return fs.readFileSync(fullPath, "utf-8");
};

export const deleteFile = (projectName: string, filePath: string): boolean => {
  const fullPath = resolveProjectPath(projectName, filePath);
  if (!fs.existsSync(fullPath)) return false;
  fs.unlinkSync(fullPath);
  return true;
};

export const fileExists = (
  projectName: string,
  filePath: string
): boolean => {
  const fullPath = resolveProjectPath(projectName, filePath);
  return fs.existsSync(fullPath);
};

export interface FileTreeNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileTreeNode[];
}

const buildTree = (dirPath: string, relativeTo: string): FileTreeNode[] => {
  if (!fs.existsSync(dirPath)) return [];

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const result: FileTreeNode[] = [];

  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;

    const fullPath = path.join(dirPath, entry.name);
    const relPath = path.relative(relativeTo, fullPath).replace(/\\/g, "/");

    if (entry.isDirectory()) {
      result.push({
        name: entry.name,
        path: relPath,
        type: "directory",
        children: buildTree(fullPath, relativeTo),
      });
    } else {
      result.push({
        name: entry.name,
        path: relPath,
        type: "file",
      });
    }
  }

  return result.sort((a, b) => {
    if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
};

export const getFileTree = (projectName: string): FileTreeNode[] => {
  const projectPath = getProjectPath(projectName);
  return buildTree(projectPath, projectPath);
};

export const listAllFiles = (projectName: string): string[] => {
  const projectPath = getProjectPath(projectName);
  const files: string[] = [];

  const walk = (dir: string): void => {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else {
        files.push(path.relative(projectPath, fullPath).replace(/\\/g, "/"));
      }
    }
  };

  walk(projectPath);
  return files.sort();
};

export const getProjectPath = (projectName: string): string =>
  safeResolveUnderRoot(assertProjectName(projectName));

export const getWorkspaceRoot = (): string => WORKSPACE_ROOT;

export const projectExists = (projectName: string): boolean =>
  fs.existsSync(getProjectPath(projectName));

/**
 * Recursively recreate a directory tree, HARD-LINKING regular files instead of
 * copying their bytes. Hard links share the underlying inode, so cloning a large
 * read-only `node_modules` is near-instant and uses ~no extra disk — yet each
 * project still owns its own directory entries, so a later `npm install` of extra
 * deps adds NEW files (new inodes) without touching sibling projects. npm/Metro
 * write atomically (temp + rename), which swaps the dir entry rather than mutating
 * the shared inode, so the shared originals stay intact. Any per-file failure
 * (cross-device EXDEV, symlink, EPERM) transparently falls back to a byte copy.
 */
const hardlinkTree = (src: string, dest: string): void => {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      hardlinkTree(srcPath, destPath);
    } else if (entry.isSymbolicLink()) {
      // Preserve symlinks (npm/pnpm .bin) by dereferencing into a real copy.
      fs.cpSync(srcPath, destPath, { recursive: true, dereference: true });
    } else {
      try {
        fs.linkSync(srcPath, destPath);
      } catch (error) {
        warnCaught("file-manager", error, `hardlink ${srcPath} → ${destPath}, copying instead`);
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }
};

/**
 * Scaffold a fresh project from the warm template. The heavy `node_modules` tree
 * is hard-linked (instant, disk-cheap); everything else is byte-copied so the
 * project can freely mutate its own source/config. This is the core generation↔
 * preview cache: every project shares the one pre-installed dependency set.
 */
export const cloneTemplateInto = (src: string, dest: string): void => {
  const destinationPath = assertWorkspacePath(dest);
  const srcPath = path.resolve(src);
  fs.mkdirSync(destinationPath, { recursive: true });

  for (const entry of fs.readdirSync(srcPath, { withFileTypes: true })) {
    const entrySrc = path.join(srcPath, entry.name);
    const entryDest = path.join(destinationPath, entry.name);
    if (entry.name === "node_modules" && entry.isDirectory()) {
      hardlinkTree(entrySrc, entryDest);
    } else {
      fs.cpSync(entrySrc, entryDest, { recursive: true });
    }
  }
};

