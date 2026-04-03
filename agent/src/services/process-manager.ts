// Runs preview and deterministic build gates while leaving top-level shutdown orchestration to server.ts.
import fs from "fs";
import path from "path";
import { spawn, spawnSync, type ChildProcess } from "child_process";
import { findFreePort } from "../lib/port-finder.js";
import { watchProcess, type LogCallback } from "./log-watcher.js";

interface ManagedProcess {
  process: ChildProcess;
  port: number;
  projectName: string;
  cleanup: () => void;
}

export interface CommandResult {
  success: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  combinedOutput: string;
}

const activeProcesses = new Map<string, ManagedProcess>();

// Max concurrent expo processes to prevent OOM
const MAX_ACTIVE_EXPO = 5;

const evictOldestIfNeeded = (): void => {
  if (activeProcesses.size < MAX_ACTIVE_EXPO) return;

  // Kill the oldest process (first inserted into the Map)
  const [oldestName, oldest] = activeProcesses.entries().next().value as [string, ManagedProcess];
  console.log(`[process-manager] Evicting oldest expo process: ${oldestName} (limit: ${MAX_ACTIVE_EXPO})`);
  killProcess(oldest.process);
  oldest.cleanup();
  activeProcesses.delete(oldestName);
};

const isWindows = process.platform === "win32";

const runWindowsTaskkill = (pid: number): void => {
  const result = spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], {
    stdio: "ignore",
    windowsHide: true,
  });

  if (result.error) {
    throw result.error;
  }
};

const killProcess = (cp: ChildProcess): void => {
  if (!cp.pid) return;

  try {
    if (isWindows) {
      runWindowsTaskkill(cp.pid);
      return;
    }

    cp.kill("SIGTERM");
    setTimeout(() => {
      if (!cp.killed) cp.kill("SIGKILL");
    }, 5000);
  } catch {
    // The process may have already exited before cleanup completed.
  }
};

export const startExpo = async (
  projectName: string,
  projectPath: string,
  onLog: LogCallback,
  clearCache = false,
): Promise<{ port: number; process: ChildProcess }> => {
  const existing = activeProcesses.get(projectName);
  if (existing) {
    killProcess(existing.process);
    existing.cleanup();
    activeProcesses.delete(projectName);
  }

  evictOldestIfNeeded();

  const port = await findFreePort();

  const npxCmd = isWindows ? "npx.cmd" : "npx";
  const args = ["expo", "start", "--web", "--port", String(port)];
  if (clearCache) args.push("--clear");

  const child = spawn(npxCmd, args, {
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

export const startExpoClearCache = async (
  projectName: string,
  projectPath: string,
  port: number,
  onLog: LogCallback
): Promise<{ port: number; process: ChildProcess }> => {
  const existing = activeProcesses.get(projectName);
  if (existing) {
    killProcess(existing.process);
    existing.cleanup();
    activeProcesses.delete(projectName);
  }

  evictOldestIfNeeded();

  const npxCmd = isWindows ? "npx.cmd" : "npx";
  const child = spawn(
    npxCmd,
    ["expo", "start", "--web", "--port", String(port), "-c"],
    {
      cwd: projectPath,
      env: { ...process.env, BROWSER: "none" },
      shell: isWindows,
      stdio: ["ignore", "pipe", "pipe"],
    }
  );

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

export const killExpo = (projectName: string): void => {
  const managed = activeProcesses.get(projectName);
  if (!managed) return;

  killProcess(managed.process);
  managed.cleanup();
  activeProcesses.delete(projectName);
};

const NPM_INSTALL_TIMEOUT_MS = 120_000; // 2 minutes

export const npmInstall = async (
  projectPath: string,
  packages?: string[]
): Promise<void> => {
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
      if (settled) return;
      settled = true;
      killProcess(child);
      reject(new Error(`npm install timed out after ${NPM_INSTALL_TIMEOUT_MS / 1000}s`));
    }, NPM_INSTALL_TIMEOUT_MS);

    let stderr = "";

    child.stderr?.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    child.on("exit", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`npm install failed (code ${code}): ${stderr.slice(0, 500)}`));
      }
    });

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(err);
    });
  });
};

export const runProjectCommand = async (
  projectPath: string,
  command: string,
  args: string[],
  timeoutMs = 120000
): Promise<CommandResult> => {
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

    const finish = (exitCode: number | null, timedOut = false): void => {
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

    child.stdout?.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr?.on("data", (data: Buffer) => {
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

export const runTypecheck = async (
  projectPath: string
): Promise<CommandResult> => {
  const npxCmd = isWindows ? "npx.cmd" : "npx";
  return runProjectCommand(projectPath, npxCmd, ["tsc", "--noEmit"], 120000);
};

export const runWebExport = async (
  projectPath: string
): Promise<CommandResult> => {
  const npxCmd = isWindows ? "npx.cmd" : "npx";
  return runProjectCommand(
    projectPath,
    npxCmd,
    ["expo", "export", "--platform", "web"],
    180000
  );
};

export const runNativeSmoke = async (
  projectPath: string,
  platform: "android" | "ios"
): Promise<CommandResult> => {
  const npxCmd = isWindows ? "npx.cmd" : "npx";
  const nativeDir = path.join(projectPath, platform);

  try {
    return await runProjectCommand(
      projectPath,
      npxCmd,
      ["expo", "prebuild", "--platform", platform, "--no-install", "--non-interactive"],
      180000
    );
  } finally {
    fs.rmSync(nativeDir, { recursive: true, force: true });
  }
};

export const getActivePort = (projectName: string): number | null => {
  const managed = activeProcesses.get(projectName);
  return managed?.port ?? null;
};

export const isRunning = (projectName: string): boolean =>
  activeProcesses.has(projectName);

export const killAll = (): void => {
  for (const [name, managed] of activeProcesses) {
    killProcess(managed.process);
    managed.cleanup();
    activeProcesses.delete(name);
  }
};
