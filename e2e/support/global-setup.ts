// Starts the LM Studio-only browser E2E runtime on a dedicated mock port while reusing healthy local agent and Expo sessions.
import fs from "node:fs";
import path from "node:path";
import type { FullConfig } from "@playwright/test";
import {
  ensureRuntimeProcess,
  stopStartedRuntimeProcesses,
  writeRuntimeState,
} from "./runtime-manager";
import {
  ensureExistingProjectFixture,
  waitForTemplateCacheReady,
} from "./existing-project-fixture";

// Generated projects (all gitignored except template_cache) accumulate across runs;
// left over, they bloat the agent's synchronous Clear-All and slow every spec via
// contention. Wipe them BEFORE the agent/Expo start so no file watcher holds a lock.
const AGENT_HEALTH_URL = "http://127.0.0.1:3100/health";
const KILL_PREVIEW_CONFIRM = "kill-preview-process";

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const syncSleep = (ms: number): void => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    // Busy-wait for EPERM/EBUSY retry in sync rmSync loop.
  }
};

/** Release Metro file handles on Windows before rmSync (Metro locks project dirs). */
const killKnownPreviewProcesses = async (workspaceRoot: string): Promise<void> => {
  try {
    const health = await fetch(AGENT_HEALTH_URL);
    if (!health.ok) {
      return;
    }
    if (!fs.existsSync(workspaceRoot)) {
      return;
    }
    for (const entry of fs.readdirSync(workspaceRoot, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name === "template_cache" || entry.name.startsWith(".")) {
        continue;
      }
      await fetch(
        `http://127.0.0.1:3100/process/${encodeURIComponent(entry.name)}/kill`,
        {
          method: "POST",
          headers: { "x-app-factory-confirm": KILL_PREVIEW_CONFIRM },
        },
      ).catch(() => undefined);
    }
    await sleep(2_000);
  } catch {
    // Agent not running yet — nothing to kill.
  }
};

const removeProjectDir = (dir: string): void => {
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 500 });
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EPERM" && code !== "EBUSY") {
        throw error;
      }
      if (attempt === 7) {
        console.warn(`[global-setup] Could not remove ${dir} (${code}); continuing`);
        return;
      }
      syncSleep(500);
    }
  }
};

const cleanStaleWorkspaceProjects = (): void => {
  const workspaceRoot = path.join(process.cwd(), "workspace");
  if (!fs.existsSync(workspaceRoot)) {
    return;
  }
  for (const entry of fs.readdirSync(workspaceRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === "template_cache" || entry.name.startsWith(".")) {
      continue;
    }
    removeProjectDir(path.join(workspaceRoot, entry.name));
  }
};

export default async function globalSetup(_config: FullConfig): Promise<void> {
  // Reap any runtime left by an interrupted prior run so ensureRuntimeProcess does
  // not attach to a stale agent/Expo that predates the current code under test.
  stopStartedRuntimeProcesses();

  const workspaceRoot = path.join(process.cwd(), "workspace");
  await killKnownPreviewProcesses(workspaceRoot);
  cleanStaleWorkspaceProjects();

  const started: { name: string; pid: number }[] = [];

  await ensureRuntimeProcess(started, {
    name: "mock-llm",
    url: "http://127.0.0.1:1235/health",
    command: process.execPath,
    args: ["./e2e/support/mock-openai-server.mjs"],
    timeoutMs: 30_000,
  });

  await ensureRuntimeProcess(started, {
    name: "agent",
    url: "http://127.0.0.1:3100/health",
    command: "npm",
    args: ["--prefix", "agent", "run", "dev"],
    timeoutMs: 60_000,
  });

  await ensureRuntimeProcess(started, {
    name: "expo-web",
    url: "http://127.0.0.1:8081",
    command: "npx",
    args: ["expo", "start", "--web", "--port", "8081"],
    timeoutMs: 180_000,
  });

  writeRuntimeState(started);

  // Wait for the agent's template-cache install to finish, then build the existing
  // project once — so no spec races the warm-up or finds a half-copied node_modules.
  await waitForTemplateCacheReady();
  ensureExistingProjectFixture();
}
