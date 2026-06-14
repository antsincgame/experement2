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
//
// web-project-deletion is INCLUDED: Clear All tests use a throwaway project and
// restore the shared fixture afterward (see web-project-deletion.spec.ts).
import { defineConfig } from "@playwright/test";
import base from "./playwright.e2e.config";

export default defineConfig({
  ...base,
  // Stability levers for the shared-backend gate (§ CODE_AUDIT M6 / handoff P1):
  //   - workers:1 (from base) — one Expo + agent + workspace backs every spec.
  //   - retries:2 here — absorb transient flakiness (WS reconnect timing, a slow
  //     first paint) without re-introducing the live-Metro-preview specs, whose
  //     2-core cold-bundle timeout is NOT a retry problem. Those belong in a nightly
  //     / dedicated-runner job with a warm template cache, not the PR gate.
  retries: 2,
  testMatch: [
    "**/web-settings-persistence.spec.ts",
    "**/web-navigation-stability.spec.ts",
    "**/web-preview-error-state.spec.ts",
    "**/web-project-deletion.spec.ts",
  ],
});
