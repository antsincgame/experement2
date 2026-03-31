// Resolves workspace paths safely so project file access cannot escape the workspace root.
import fs from "fs";
import path from "path";
const WORKSPACE_ROOT = path.resolve(process.cwd(), "../workspace");
const ensureDir = (filepath) => {
    fs.mkdirSync(path.dirname(filepath), { recursive: true });
};
const assertProjectName = (projectName) => {
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
const assertRelativeProjectPath = (filePath) => {
    const trimmed = filePath.trim();
    if (!trimmed) {
        throw new Error("File path is required");
    }
    if (path.isAbsolute(trimmed) || trimmed.includes("\0")) {
        throw new Error(`Invalid file path: ${filePath}`);
    }
    return trimmed;
};
const assertWithinRoot = (rootPath, candidatePath) => {
    const relativePath = path.relative(rootPath, candidatePath);
    if (relativePath === "" ||
        (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))) {
        return;
    }
    throw new Error(`Resolved path escapes allowed root: ${candidatePath}`);
};
const assertWorkspacePath = (candidatePath) => {
    const resolvedPath = path.resolve(candidatePath);
    assertWithinRoot(WORKSPACE_ROOT, resolvedPath);
    return resolvedPath;
};
export const safeResolveUnderRoot = (...segments) => {
    const resolvedPath = path.resolve(WORKSPACE_ROOT, ...segments);
    assertWithinRoot(WORKSPACE_ROOT, resolvedPath);
    return resolvedPath;
};
const resolveProjectPath = (projectName, filePath) => {
    const projectRoot = getProjectPath(projectName);
    const resolvedPath = path.resolve(projectRoot, assertRelativeProjectPath(filePath));
    assertWithinRoot(projectRoot, resolvedPath);
    return resolvedPath;
};
export const writeFile = (projectName, filePath, content) => {
    const fullPath = resolveProjectPath(projectName, filePath);
    ensureDir(fullPath);
    fs.writeFileSync(fullPath, content, "utf-8");
};
export const readFile = (projectName, filePath) => {
    const fullPath = resolveProjectPath(projectName, filePath);
    if (!fs.existsSync(fullPath))
        return null;
    return fs.readFileSync(fullPath, "utf-8");
};
export const deleteFile = (projectName, filePath) => {
    const fullPath = resolveProjectPath(projectName, filePath);
    if (!fs.existsSync(fullPath))
        return false;
    fs.unlinkSync(fullPath);
    return true;
};
export const fileExists = (projectName, filePath) => {
    const fullPath = resolveProjectPath(projectName, filePath);
    return fs.existsSync(fullPath);
};
const buildTree = (dirPath, relativeTo) => {
    if (!fs.existsSync(dirPath))
        return [];
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const result = [];
    for (const entry of entries) {
        if (entry.name === "node_modules" || entry.name === ".git")
            continue;
        const fullPath = path.join(dirPath, entry.name);
        const relPath = path.relative(relativeTo, fullPath).replace(/\\/g, "/");
        if (entry.isDirectory()) {
            result.push({
                name: entry.name,
                path: relPath,
                type: "directory",
                children: buildTree(fullPath, relativeTo),
            });
        }
        else {
            result.push({
                name: entry.name,
                path: relPath,
                type: "file",
            });
        }
    }
    return result.sort((a, b) => {
        if (a.type !== b.type)
            return a.type === "directory" ? -1 : 1;
        return a.name.localeCompare(b.name);
    });
};
export const getFileTree = (projectName) => {
    const projectPath = getProjectPath(projectName);
    return buildTree(projectPath, projectPath);
};
export const listAllFiles = (projectName) => {
    const projectPath = getProjectPath(projectName);
    const files = [];
    const walk = (dir) => {
        if (!fs.existsSync(dir))
            return;
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.name === "node_modules" || entry.name === ".git")
                continue;
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                walk(fullPath);
            }
            else {
                files.push(path.relative(projectPath, fullPath).replace(/\\/g, "/"));
            }
        }
    };
    walk(projectPath);
    return files.sort();
};
export const getProjectPath = (projectName) => safeResolveUnderRoot(assertProjectName(projectName));
export const getWorkspaceRoot = () => WORKSPACE_ROOT;
export const projectExists = (projectName) => fs.existsSync(getProjectPath(projectName));
export const copyDirectory = (src, dest) => {
    const destinationPath = assertWorkspacePath(dest);
    ensureDir(path.join(destinationPath, "placeholder"));
    fs.cpSync(path.resolve(src), destinationPath, { recursive: true });
};
//# sourceMappingURL=file-manager.js.map