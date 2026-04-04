// Starts the web UI, local agent, and mock LLM so the browser E2E can exercise the full happy-path deterministically.
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 180_000,
  expect: {
    timeout: 30_000,
  },
  fullyParallel: false,
  retries: 0,
  globalSetup: "./e2e/support/global-setup.ts",
  globalTeardown: "./e2e/support/global-teardown.ts",
  use: {
    baseURL: "http://127.0.0.1:8081",
    headless: true,
    trace: "on-first-retry",
  },
});
