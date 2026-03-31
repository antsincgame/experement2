import fs from "fs";
import path from "path";
const WORKSPACE_ROOT = path.resolve(process.cwd(), "../workspace");
const ensureDir = (filepath) => {
    fs.mkdirSync(path.dirname(filepath), { recursive: true });
};
const resolveProjectPath = (projectName, filePath) => path.join(WORKSPACE_ROOT, projectName, filePath);
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
    const projectPath = path.join(WORKSPACE_ROOT, projectName);
    return buildTree(projectPath, projectPath);
};
export const listAllFiles = (projectName) => {
    const projectPath = path.join(WORKSPACE_ROOT, projectName);
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
export const getProjectPath = (projectName) => path.join(WORKSPACE_ROOT, projectName);
export const getWorkspaceRoot = () => WORKSPACE_ROOT;
export const projectExists = (projectName) => fs.existsSync(path.join(WORKSPACE_ROOT, projectName));
export const copyDirectory = (src, dest) => {
    ensureDir(dest + "/placeholder");
    fs.cpSync(src, dest, { recursive: true });
};
//# sourceMappingURL=file-manager.js.map