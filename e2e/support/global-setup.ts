// Starts the LM Studio-only browser E2E runtime on a dedicated mock port while reusing healthy local agent and Expo sessions.
import type { FullConfig } from "@playwright/test";
import {
  ensureRuntimeProcess,
  writeRuntimeState,
} from "./runtime-manager";

export default async function globalSetup(_config: FullConfig): Promise<void> {
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
}
