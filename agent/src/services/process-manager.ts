// Runs preview and deterministic build gates while leaving top-level shutdown orchestration to server.ts.
import fs from "fs";
import path from "path";
import { spawn, spawnSync, type ChildProcess } from "child_process";
import { findFreePort, isPortFree } from "../lib/port-finder.js";
import { broadcast, setPreviewPort } from "../lib/event-bus.js";
import { watchProcess, type LogCallback } from "./log-watcher.js";
import { warnCaught } from "../lib/catch-log.js";
import {
  enqueueProjectOperation,
  METRO_OPERATION_QUEUE_KEY,
} from "./project-operation-lock.js";

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

const PREVIEW_STOPPED_REASON =
  "Preview stopped — another project started Metro";

// Singleton Metro: only 1 bundler at a time to prevent OOM and browser freezes

const announcePreviewStopped = (
  projectName: string,
  reason?: string,
): void => {
  setPreviewPort(projectName, null);
  broadcast({
    type: "preview_status",
    previewStatus: "stopped",
    projectName,
    ...(reason ? { error: reason } : {}),
  });
};

const killManagedEntry = (name: string, managed: ManagedProcess): void => {
  killProcess(managed.process);
  managed.cleanup();
  activeProcesses.delete(name);
};

/** Kill all bundlers except `keep`; returns evicted project names. */
const evictOtherBundlers = (keep: string): string[] => {
  const evicted: string[] = [];
  for (const [name, managed] of [...activeProcesses.entries()]) {
    if (name === keep) {
      continue;
    }
    killManagedEntry(name, managed);
    evicted.push(name);
  }
  return evicted;
};

const prepareSingletonStart = (projectName: string): void => {
  for (const name of evictOtherBundlers(projectName)) {
    announcePreviewStopped(name, PREVIEW_STOPPED_REASON);
  }
  const own = activeProcesses.get(projectName);
  if (own) {
    killManagedEntry(projectName, own);
    setPreviewPort(projectName, null);
  }
};

const isWindows = process.platform === "win32";

const runWindowsTaskkill = (pid: number): void => {
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

const killProcess = (cp: ChildProcess): void => {
  const pid = cp.pid;
  if (!pid) return;

  try {
    if (isWindows) {
      // /T kills the process tree (all children)
      runWindowsTaskkill(pid);
      return;
    }

    // Kill entire process group on Unix (negative PID = process group)
    try {
      process.kill(-pid, "SIGTERM");
    } catch (error) {
      warnCaught("process-manager", error, `SIGTERM process group -${pid}, killing child directly`);
      cp.kill("SIGTERM");
    }
    const forceKillTimer = setTimeout(() => {
      try {
        if (!cp.killed) process.kill(-pid, "SIGKILL");
      } catch (error) {
        warnCaught("process-manager", error, `SIGKILL process group -${pid}`);
      }
    }, 5000);
    forceKillTimer.unref();

    const clearForceKillTimer = (): void => {
      clearTimeout(forceKillTimer);
    };

    cp.once("exit", clearForceKillTimer);
    cp.once("close", clearForceKillTimer);
  } catch (error) {
    warnCaught("process-manager", error, "kill preview process");
  }
};

const startExpoInner = async (
  projectName: string,
  projectPath: string,
  onLog: LogCallback,
  clearCache = false,
): Promise<{ port: number; process: ChildProcess }> => {
  prepareSingletonStart(projectName);

  const port = await findFreePort();

  const npxCmd = isWindows ? "npx.cmd" : "npx";
  const args = ["expo", "start", "--web", "--port", String(port)];
  if (clearCache) args.push("--clear");

  const child = spawn(npxCmd, args, {
    cwd: projectPath,
    env: { ...process.env, BROWSER: "none" },
    shell: isWindows,
    detached: !isWindows, // Unix: create process group so kill(-pid) works
    stdio: ["ignore", "pipe", "pipe"],
  });

  const cleanup = watchProcess(child, onLog);

  const managed: ManagedProcess = { process: child, port, projectName, cleanup };
  activeProcesses.set(projectName, managed);

  child.on("exit", (code) => {
    cleanup();
    // Only forget THIS bundler if a newer one for the same slug hasn't replaced
    // it — a late exit from the old process must not evict the new entry.
    if (activeProcesses.get(projectName) === managed) {
      activeProcesses.delete(projectName);
      announcePreviewStopped(projectName);
    }
    onLog({
      type: "build_log",
      message: `[Metro] Process exited with code ${code}`,
    });
  });

  return { port, process: child };
};

export const startExpo = (
  projectName: string,
  projectPath: string,
  onLog: LogCallback,
  clearCache = false,
): Promise<{ port: number; process: ChildProcess }> =>
  enqueueProjectOperation(
    METRO_OPERATION_QUEUE_KEY,
    `startExpo:${projectName}`,
    () => startExpoInner(projectName, projectPath, onLog, clearCache),
  );

const startExpoClearCacheInner = async (
  projectName: string,
  projectPath: string,
  port: number,
  onLog: LogCallback,
): Promise<{ port: number; process: ChildProcess }> => {
  prepareSingletonStart(projectName);

  // The previous bundler for this slug was just killed but may not have released
  // the socket yet; fall back to a fresh port instead of crashing with EADDRINUSE.
  const boundPort = (await isPortFree(port)) ? port : await findFreePort();

  const npxCmd = isWindows ? "npx.cmd" : "npx";
  const child = spawn(
    npxCmd,
    ["expo", "start", "--web", "--port", String(boundPort), "-c"],
    {
      cwd: projectPath,
      env: { ...process.env, BROWSER: "none" },
      shell: isWindows,
      detached: !isWindows,
      stdio: ["ignore", "pipe", "pipe"],
    }
  );

  const cleanup = watchProcess(child, onLog);

  const managed: ManagedProcess = { process: child, port: boundPort, projectName, cleanup };
  activeProcesses.set(projectName, managed);

  child.on("exit", (code) => {
    cleanup();
    if (activeProcesses.get(projectName) === managed) {
      activeProcesses.delete(projectName);
      announcePreviewStopped(projectName);
    }
    onLog({
      type: "build_log",
      message: `[Metro] Process exited with code ${code}`,
    });
  });

  return { port: boundPort, process: child };
};

export const startExpoClearCache = (
  projectName: string,
  projectPath: string,
  port: number,
  onLog: LogCallback,
): Promise<{ port: number; process: ChildProcess }> =>
  enqueueProjectOperation(
    METRO_OPERATION_QUEUE_KEY,
    `startExpoClearCache:${projectName}`,
    () => startExpoClearCacheInner(projectName, projectPath, port, onLog),
  );

export const killExpo = (projectName: string): void => {
  const managed = activeProcesses.get(projectName);
  if (!managed) return;

  killManagedEntry(projectName, managed);
  announcePreviewStopped(projectName);
};

const NPM_INSTALL_TIMEOUT_MS = 300_000; // 5 minutes (Tamagui is large)

export const npmInstall = async (
  projectPath: string,
  packages?: string[]
): Promise<void> => {
  const npmCmd = isWindows ? "npm.cmd" : "npm";
  const args = packages?.length
    ? ["install", "--ignore-scripts", ...packages]
    : ["install", "--ignore-scripts"];

  return new Promise((resolve, reject) => {
    let settled = false;

    const child = spawn(npmCmd, args, {
      cwd: projectPath,
      shell: isWindows,
      // stdout is ignored on purpose: npm progress output can exceed the ~64KB
      // OS pipe buffer, and nothing drains stdout here, which would deadlock the
      // child until the timeout. Failures are reported via stderr below.
      stdio: ["ignore", "ignore", "pipe"],
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
    let timeout: ReturnType<typeof setTimeout> | undefined;
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

    timeout = setTimeout(() => {
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
      ["expo", "prebuild", "--platform", platform, "--no-install", "--clean"],
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

// Kills preview bundlers left behind by a previous agent run (e.g. after a
// dev-server restart). Matches only node processes that launched Expo from the
// workspace directory, so the App Factory web shell (started from the repo root)
// is never affected.
export const killOrphanedPreviewProcesses = (): void => {
  try {
    if (isWindows) {
      const script =
        "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | " +
        "Where-Object { $_.CommandLine -match 'workspace' -and $_.CommandLine -match 'expo' } | " +
        "ForEach-Object { $_.ProcessId }";
      const result = spawnSync(
        "powershell",
        ["-NoProfile", "-NonInteractive", "-Command", script],
        { encoding: "utf8", windowsHide: true, timeout: 10_000 }
      );
      const pids = (result.stdout ?? "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => /^\d+$/.test(line));
      for (const pid of pids) {
        try {
          runWindowsTaskkill(Number(pid));
        } catch (error) {
          warnCaught("process-manager", error, `cleanup orphaned preview pid ${pid}`);
        }
      }
      if (pids.length > 0) {
        console.log(`[ProcessManager] Cleaned up ${pids.length} orphaned preview process(es)`);
      }
      return;
    }

    // Unix: kill node processes running Expo from any workspace path.
    spawnSync("pkill", ["-f", "workspace/.*expo.*start"], { timeout: 10_000 });
  } catch (err) {
    console.warn(
      `[ProcessManager] Orphan cleanup failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }
};

export const killAll = (): void => {
  for (const [name, managed] of activeProcesses) {
    try {
      killProcess(managed.process);
      managed.cleanup();
    } catch (err) {
      console.warn(`[ProcessManager] Failed to kill ${name}: ${err instanceof Error ? err.message : String(err)}`);
    }
    activeProcesses.delete(name);
    // Clear the proxy/port mapping so a killed project's preview stops resolving
    // to a now-dead Metro port.
    setPreviewPort(name, null);
  }
};
