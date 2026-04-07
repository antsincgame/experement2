// Runs preview and deterministic build gates while leaving top-level shutdown orchestration to server.ts.
import fs from "fs";
import path from "path";
import { spawn, spawnSync } from "child_process";
import { findFreePort } from "../lib/port-finder.js";
import { watchProcess } from "./log-watcher.js";
const activeProcesses = new Map();
// Singleton Metro: only 1 bundler at a time to prevent OOM and browser freezes
const isWindows = process.platform === "win32";
const runWindowsTaskkill = (pid) => {
    const result = spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
        timeout: 10_000,
    });
    if (result.error) {
        throw result.error;
    }
    if (result.status !== 0 && result.status !== null) {
        console.warn(`[ProcessManager] taskkill exit code ${result.status} for PID ${pid} — process may already be dead`);
    }
};
const killProcess = (cp) => {
    const pid = cp.pid;
    if (!pid)
        return;
    try {
        if (isWindows) {
            // /T kills the process tree (all children)
            runWindowsTaskkill(pid);
            return;
        }
        // Kill entire process group on Unix (negative PID = process group)
        try {
            process.kill(-pid, "SIGTERM");
        }
        catch {
            cp.kill("SIGTERM");
        }
        const forceKillTimer = setTimeout(() => {
            try {
                if (!cp.killed)
                    process.kill(-pid, "SIGKILL");
            }
            catch { /* already dead */ }
        }, 5000);
        forceKillTimer.unref();
        const clearForceKillTimer = () => {
            clearTimeout(forceKillTimer);
        };
        cp.once("exit", clearForceKillTimer);
        cp.once("close", clearForceKillTimer);
    }
    catch {
        // The process may have already exited before cleanup completed.
    }
};
export const startExpo = async (projectName, projectPath, onLog, clearCache = false) => {
    // Singleton: kill ALL running bundlers before starting a new one
    killAll();
    const port = await findFreePort();
    const npxCmd = isWindows ? "npx.cmd" : "npx";
    const args = ["expo", "start", "--web", "--port", String(port)];
    if (clearCache)
        args.push("--clear");
    const child = spawn(npxCmd, args, {
        cwd: projectPath,
        env: { ...process.env, BROWSER: "none" },
        shell: isWindows,
        detached: !isWindows, // Unix: create process group so kill(-pid) works
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
    // Singleton: kill ALL running bundlers before starting a new one
    killAll();
    const npxCmd = isWindows ? "npx.cmd" : "npx";
    const child = spawn(npxCmd, ["expo", "start", "--web", "--port", String(port), "-c"], {
        cwd: projectPath,
        env: { ...process.env, BROWSER: "none" },
        shell: isWindows,
        detached: !isWindows,
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
const NPM_INSTALL_TIMEOUT_MS = 300_000; // 5 minutes (Tamagui is large)
export const npmInstall = async (projectPath, packages) => {
    const npmCmd = isWindows ? "npm.cmd" : "npm";
    const args = packages?.length
        ? ["install", ...packages]
        : ["install"];
    return new Promise((resolve, reject) => {
        let settled = false;
        const child = spawn(npmCmd, args, {
            cwd: projectPath,
            shell: isWindows,
            stdio: ["ignore", "pipe", "pipe"],
        });
        const timeout = setTimeout(() => {
            if (settled)
                return;
            settled = true;
            killProcess(child);
            reject(new Error(`npm install timed out after ${NPM_INSTALL_TIMEOUT_MS / 1000}s`));
        }, NPM_INSTALL_TIMEOUT_MS);
        let stderr = "";
        child.stderr?.on("data", (data) => {
            stderr += data.toString();
        });
        child.on("exit", (code) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timeout);
            if (code === 0) {
                resolve();
            }
            else {
                reject(new Error(`npm install failed (code ${code}): ${stderr.slice(0, 500)}`));
            }
        });
        child.on("error", (err) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timeout);
            reject(err);
        });
    });
};
export const runProjectCommand = async (projectPath, command, args, timeoutMs = 120000) => {
    return new Promise((resolve) => {
        let timeout;
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
            if (timeout !== undefined) {
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
        timeout = setTimeout(() => {
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
        return await runProjectCommand(projectPath, npxCmd, ["expo", "prebuild", "--platform", platform, "--no-install", "--clean"], 180000);
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
        try {
            killProcess(managed.process);
            managed.cleanup();
        }
        catch (err) {
            console.warn(`[ProcessManager] Failed to kill ${name}: ${err instanceof Error ? err.message : String(err)}`);
        }
        activeProcesses.delete(name);
    }
};
//# sourceMappingURL=process-manager.js.map