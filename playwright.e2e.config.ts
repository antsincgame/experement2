// Starts the web UI, local agent, and mock LLM so the browser E2E can exercise the full happy-path deterministically.
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 180_000,
  expect: {
    timeout: 30_000,
  },
  fullyParallel: false,
  // One shared agent + Expo + workspace + preview runtime backs every spec, so the
  // suite MUST run single-threaded. `fullyParallel: false` only serializes WITHIN a
  // file; without this, Playwright still runs separate spec files across 2 workers,
  // and they fight over the one backend — Clear All wipes another spec's fixture, two
  // Metro previews bundle at once and blow the 180s timeout, connections contend.
  workers: 1,
  retries: 0,
  globalSetup: "./e2e/support/global-setup.ts",
  globalTeardown: "./e2e/support/global-teardown.ts",
  use: {
    baseURL: "http://127.0.0.1:8081",
    headless: true,
    trace: "retain-on-failure",
  },
});
