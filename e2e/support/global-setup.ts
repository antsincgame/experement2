// Starts the LM Studio-only browser E2E runtime on a dedicated mock port while reusing healthy local agent and Expo sessions.
import fs from "node:fs";
import path from "node:path";
import type { FullConfig } from "@playwright/test";
import {
  ensureRuntimeProcess,
  writeRuntimeState,
} from "./runtime-manager";
import {
  ensureExistingProjectFixture,
  waitForTemplateCacheReady,
} from "./existing-project-fixture";

// Generated projects (all gitignored except template_cache) accumulate across runs;
// left over, they bloat the agent's synchronous Clear-All and slow every spec via
// contention. Wipe them BEFORE the agent/Expo start so no file watcher holds a lock.
const cleanStaleWorkspaceProjects = (): void => {
  const workspaceRoot = path.join(process.cwd(), "workspace");
  if (!fs.existsSync(workspaceRoot)) {
    return;
  }
  for (const entry of fs.readdirSync(workspaceRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === "template_cache" || entry.name.startsWith(".")) {
      continue;
    }
    fs.rmSync(path.join(workspaceRoot, entry.name), {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 200,
    });
  }
};

export default async function globalSetup(_config: FullConfig): Promise<void> {
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
