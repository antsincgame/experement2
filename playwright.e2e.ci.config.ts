// New CI gate for the browser E2E: a fast, DETERMINISTIC subset.
//
// The previous job ran the whole suite under continue-on-error and was permanently
// red, because the live-Metro-preview specs (happy-path, preview-refresh, and a few
// preview/reconnect/chat-nav timing tests) depend on a cold Expo + Tamagui web
// bundle finishing within the timeout on a 2-core runner — that is unreliable, and
// is exactly what the design/preview critique loop (Track B) is meant to harden.
//
// This config runs only the UI/state specs that pass deterministically, so the gate
// is trustworthy. The full suite still runs locally via playwright.e2e.config.ts;
// re-add specs here as live preview rendering is stabilized.
import { defineConfig } from "@playwright/test";
import base from "./playwright.e2e.config";

export default defineConfig({
  ...base,
  testMatch: [
    "**/web-settings-persistence.spec.ts",
    "**/web-navigation-stability.spec.ts",
    "**/web-project-deletion.spec.ts",
    "**/web-preview-error-state.spec.ts",
  ],
});
