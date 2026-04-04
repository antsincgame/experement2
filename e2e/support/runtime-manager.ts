// Reuses or boots the local browser-E2E runtime so Playwright can work both with and without prestarted services.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

interface ManagedRuntimeProcess {
  name: string;
  pid: number;
}

const isWindows = process.platform === "win32";
const POLL_INTERVAL_MS = 1_000;

export const RUNTIME_STATE_PATH = path.join(
  os.tmpdir(),
  "app-factory-playwright-runtime.json"
);

const COMMON_ENV = {
  ...process.env,
  BROWSER: "none",
  CI: "1",
};

const resolveCommand = (command: string): string => {
  if (!isWindows) {
    return command;
  }

  if (command === "npm") {
    return "npm.cmd";
  }

  if (command === "npx") {
    return "npx.cmd";
  }

  return command;
};

export const isUrlReady = async (url: string): Promise<boolean> => {
  try {
    const response = await fetch(url);
    return response.ok;
  } catch {
    return false;
  }
};

const waitForUrl = async (
  name: string,
  url: string,
  timeoutMs: number
): Promise<void> => {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await isUrlReady(url)) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error(`Timed out waiting for ${name} at ${url}`);
};

const spawnDetachedProcess = (
  command: string,
  args: string[]
): number => {
  const spawned = spawn(resolveCommand(command), args, {
    cwd: process.cwd(),
    env: COMMON_ENV,
    shell: false,
    detached: !isWindows,
    stdio: "ignore",
  });

  if (!spawned.pid) {
    throw new Error(`Failed to start process: ${command} ${args.join(" ")}`);
  }

  spawned.unref();
  return spawned.pid;
};

export const ensureRuntimeProcess = async (
  started: ManagedRuntimeProcess[],
  options: {
    name: string;
    url: string;
    command: string;
    args: string[];
    timeoutMs: number;
  }
): Promise<void> => {
  if (await isUrlReady(options.url)) {
    return;
  }

  const pid = spawnDetachedProcess(options.command, options.args);
  started.push({ name: options.name, pid });
  await waitForUrl(options.name, options.url, options.timeoutMs);
};

export const writeRuntimeState = (
  started: ManagedRuntimeProcess[]
): void => {
  fs.writeFileSync(RUNTIME_STATE_PATH, JSON.stringify(started), "utf-8");
};

export const readRuntimeState = (): ManagedRuntimeProcess[] => {
  if (!fs.existsSync(RUNTIME_STATE_PATH)) {
    return [];
  }

  try {
    return JSON.parse(fs.readFileSync(RUNTIME_STATE_PATH, "utf-8")) as ManagedRuntimeProcess[];
  } catch {
    return [];
  }
};

const killPid = (pid: number): void => {
  if (pid <= 0) {
    return;
  }

  if (isWindows) {
    spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
    return;
  }

  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    process.kill(pid, "SIGTERM");
  }
};

export const stopStartedRuntimeProcesses = (): void => {
  const started = readRuntimeState();
  for (const processInfo of started.reverse()) {
    killPid(processInfo.pid);
  }

  if (fs.existsSync(RUNTIME_STATE_PATH)) {
    fs.rmSync(RUNTIME_STATE_PATH, { force: true });
  }
};
