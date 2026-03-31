// Runs preview and deterministic build gates while leaving top-level shutdown orchestration to server.ts.
import fs from "fs";
import path from "path";
import { spawn, spawnSync } from "child_process";
import { findFreePort } from "../lib/port-finder.js";
import { watchProcess } from "./log-watcher.js";
const activeProcesses = new Map();
// Max concurrent expo processes to prevent OOM
const MAX_ACTIVE_EXPO = 3;
const evictOldestIfNeeded = () => {
    if (activeProcesses.size < MAX_ACTIVE_EXPO)
        return;
    // Kill the oldest process (first inserted into the Map)
    const [oldestName, oldest] = activeProcesses.entries().next().value;
    console.log(`[process-manager] Evicting oldest expo process: ${oldestName} (limit: ${MAX_ACTIVE_EXPO})`);
    killProcess(oldest.process);
    oldest.cleanup();
    activeProcesses.delete(oldestName);
};
const isWindows = process.platform === "win32";
const runWindowsTaskkill = (pid) => {
    const result = spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
    });
    if (result.error) {
        throw result.error;
    }
};
const killProcess = (cp) => {
    if (!cp.pid)
        return;
    try {
        if (isWindows) {
            runWindowsTaskkill(cp.pid);
            return;
        }
        cp.kill("SIGTERM");
        setTimeout(() => {
            if (!cp.killed)
                cp.kill("SIGKILL");
        }, 5000);
    }
    catch {
        // The process may have already exited before cleanup completed.
    }
};
export const startExpo = async (projectName, projectPath, onLog) => {
    const existing = activeProcesses.get(projectName);
    if (existing) {
        killProcess(existing.process);
        existing.cleanup();
        activeProcesses.delete(projectName);
    }
    evictOldestIfNeeded();
    const port = await findFreePort();
    const npxCmd = isWindows ? "npx.cmd" : "npx";
    const child = spawn(npxCmd, ["expo", "start", "--web", "--port", String(port)], {
        cwd: projectPath,
        env: { ...process.env, BROWSER: "none" },
        shell: isWindows,
        stdio: ["ignore", "pipe", "pipe"],
    });
    const cleanup = watchProcess(child, onLog);
    activeProcesses.set(projectName, {
        process: child,
        port,
        projectName,
        cleanup,
    });
    child.on("exit", (code) => {
        cleanup();
        activeProcesses.delete(projectName);
        onLog({
            type: "build_log",
            message: `[Metro] Process exited with code ${code}`,
        });
    });
    return { port, process: child };
};
export const startExpoClearCache = async (projectName, projectPath, port, onLog) => {
    const existing = activeProcesses.get(projectName);
    if (existing) {
        killProcess(existing.process);
        existing.cleanup();
        activeProcesses.delete(projectName);
    }
    evictOldestIfNeeded();
    const npxCmd = isWindows ? "npx.cmd" : "npx";
    const child = spawn(npxCmd, ["expo", "start", "--web", "--port", String(port), "-c"], {
        cwd: projectPath,
        env: { ...process.env, BROWSER: "none" },
        shell: isWindows,
        stdio: ["ignore", "pipe", "pipe"],
    });
    const cleanup = watchProcess(child, onLog);
    activeProcesses.set(projectName, {
        process: child,
        port,
        projectName,
        cleanup,
    });
    child.on("exit", (code) => {
        cleanup();
        activeProcesses.delete(projectName);
        onLog({
            type: "build_log",
            message: `[Metro] Process exited with code ${code}`,
        });
    });
    return { port, process: child };
};
export const killExpo = (projectName) => {
    const managed = activeProcesses.get(projectName);
    if (!managed)
        return;
    killProcess(managed.process);
    managed.cleanup();
    activeProcesses.delete(projectName);
};
export const npmInstall = async (projectPath, packages) => {
    const npmCmd = isWindows ? "npm.cmd" : "npm";
    const args = packages?.length
        ? ["install", ...packages]
        : ["install"];
    return new Promise((resolve, reject) => {
        const child = spawn(npmCmd, args, {
            cwd: projectPath,
            shell: isWindows,
            stdio: ["ignore", "pipe", "pipe"],
        });
        let stderr = "";
        child.stderr?.on("data", (data) => {
            stderr += data.toString();
        });
        child.on("exit", (code) => {
            if (code === 0) {
                resolve();
            }
            else {
                reject(new Error(`npm install failed (code ${code}): ${stderr.slice(0, 500)}`));
            }
        });
        child.on("error", reject);
    });
};
export const runProjectCommand = async (projectPath, command, args, timeoutMs = 120000) => {
    return new Promise((resolve) => {
        const child = spawn(command, args, {
            cwd: projectPath,
            env: { ...process.env, CI: "1", BROWSER: "none" },
            shell: isWindows,
            stdio: ["ignore", "pipe", "pipe"],
        });
        let stdout = "";
        let stderr = "";
        let settled = false;
        const finish = (exitCode, timedOut = false) => {
            if (settled) {
                return;
            }
            settled = true;
            if (timeout) {
                clearTimeout(timeout);
            }
            resolve({
                success: !timedOut && exitCode === 0,
                exitCode,
                stdout,
                stderr,
                combinedOutput: [stdout, stderr].filter(Boolean).join("\n").trim(),
            });
        };
        child.stdout?.on("data", (data) => {
            stdout += data.toString();
        });
        child.stderr?.on("data", (data) => {
            stderr += data.toString();
        });
        child.on("exit", (code) => finish(code));
        child.on("error", (error) => {
            stderr += error.message;
            finish(1);
        });
        const timeout = setTimeout(() => {
            killProcess(child);
            stderr += `\nCommand timed out after ${timeoutMs}ms`;
            finish(124, true);
        }, timeoutMs);
    });
};
export const runTypecheck = async (projectPath) => {
    const npxCmd = isWindows ? "npx.cmd" : "npx";
    return runProjectCommand(projectPath, npxCmd, ["tsc", "--noEmit"], 120000);
};
export const runWebExport = async (projectPath) => {
    const npxCmd = isWindows ? "npx.cmd" : "npx";
    return runProjectCommand(projectPath, npxCmd, ["expo", "export", "--platform", "web"], 180000);
};
export const runNativeSmoke = async (projectPath, platform) => {
    const npxCmd = isWindows ? "npx.cmd" : "npx";
    const nativeDir = path.join(projectPath, platform);
    try {
        return await runProjectCommand(projectPath, npxCmd, ["expo", "prebuild", "--platform", platform, "--no-install", "--non-interactive"], 180000);
    }
    finally {
        fs.rmSync(nativeDir, { recursive: true, force: true });
    }
};
export const getActivePort = (projectName) => {
    const managed = activeProcesses.get(projectName);
    return managed?.port ?? null;
};
export const isRunning = (projectName) => activeProcesses.has(projectName);
export const killAll = () => {
    for (const [name, managed] of activeProcesses) {
        killProcess(managed.process);
        managed.cleanup();
        activeProcesses.delete(name);
    }
};
//# sourceMappingURL=process-manager.js.map