import { spawn, type ChildProcess, execSync } from "child_process";
import { findFreePort } from "../lib/port-finder.js";
import { watchProcess, type LogCallback } from "./log-watcher.js";

interface ManagedProcess {
  process: ChildProcess;
  port: number;
  projectName: string;
  cleanup: () => void;
}

const activeProcesses = new Map<string, ManagedProcess>();

// Max concurrent expo processes to prevent OOM
const MAX_ACTIVE_EXPO = 3;

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

const killProcess = (cp: ChildProcess): void => {
  if (!cp.pid) return;

  try {
    if (isWindows) {
      execSync(`taskkill /pid ${cp.pid} /T /F`, { stdio: "ignore" });
    } else {
      cp.kill("SIGTERM");
      setTimeout(() => {
        if (!cp.killed) cp.kill("SIGKILL");
      }, 5000);
    }
  } catch {
    // процесс мог уже завершиться
  }
};

export const startExpo = async (
  projectName: string,
  projectPath: string,
  onLog: LogCallback
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

export const npmInstall = async (
  projectPath: string,
  packages?: string[]
): Promise<void> => {
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

    child.stderr?.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`npm install failed (code ${code}): ${stderr.slice(0, 500)}`));
      }
    });

    child.on("error", reject);
  });
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

process.on("SIGINT", () => {
  killAll();
  process.exit(0);
});

process.on("SIGTERM", () => {
  killAll();
  process.exit(0);
});
