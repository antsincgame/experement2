// Verifies VersionTimeline revert restores prior preview content in the iframe.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { ensureExistingProjectFixture } from "./support/existing-project-fixture";

const AGENT_URL = "http://127.0.0.1:3100";
const MOCK_LLM_URL = "http://127.0.0.1:1235";
const FIXTURE_PROJECT = {
  name: "e2e-existing-project",
  displayName: "E2E Existing Project",
};

const repoRoot = process.cwd();
const workspaceRoot = path.join(repoRoot, "workspace");
const templateCachePath = path.join(workspaceRoot, "template_cache");
const fixturePath = path.join(workspaceRoot, FIXTURE_PROJECT.name);

const SETTINGS_SNAPSHOT = {
  state: {
    lmStudioUrl: MOCK_LLM_URL,
    model: "",
    temperature: 0.4,
    maxTokens: 65536,
    maxContextTokens: 65536,
    agentUrl: AGENT_URL,
    enhancerModel: "",
    enhancerEnabled: false,
  },
  version: 0,
};

const resetFixtureGit = (): void => {
  const gitDir = path.join(fixturePath, ".git");
  if (!fs.existsSync(gitDir)) {
    return;
  }
  try {
    fs.rmSync(gitDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
  } catch {
    // Best-effort — stale git history only affects version chip labels.
  }
};

/** Seed v1 so the first iteration becomes v2 (pipeline counts commits before gitInit). */
const seedFixtureGit = (): void => {
  resetFixtureGit();
  const runGit = (args: string[]): void => {
    const result = spawnSync("git", args, {
      cwd: fixturePath,
      encoding: "utf-8",
      windowsHide: true,
    });
    if (result.status !== 0) {
      throw new Error(`git ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
    }
  };
  runGit(["init"]);
  runGit(["config", "user.email", "e2e@test.local"]);
  runGit(["config", "user.name", "E2E"]);
  runGit(["add", "-A"]);
  runGit(["commit", "-m", "v1: fixture"]);
};

const resetFixtureProject = (): void => {
  if (!fs.existsSync(templateCachePath)) {
    throw new Error(`Template cache not found: ${templateCachePath}`);
  }
  ensureExistingProjectFixture();
  seedFixtureGit();
};

const killFixturePreviewProcess = async (): Promise<void> => {
  try {
    await fetch(`${AGENT_URL}/process/${encodeURIComponent(FIXTURE_PROJECT.name)}/kill`, {
      method: "POST",
      headers: { "x-app-factory-confirm": "kill-preview-process" },
    });
  } catch {
    // Agent may be down during local debugging — the spec will fail on connect anyway.
  }
};

const previewFrame = (page: import("@playwright/test").Page) =>
  page.frameLocator(`iframe[title="Preview ${FIXTURE_PROJECT.name}"]`);

const sendIteration = async (
  page: import("@playwright/test").Page,
  prompt: string,
): Promise<void> => {
  const chatInput = page.locator('textarea[aria-label="Chat message input"]:visible');
  await chatInput.fill(prompt);
  await page.locator('[aria-label="Send chat message"]:visible').click();
};

test.beforeAll(() => {
  resetFixtureProject();
});

test.beforeEach(async () => {
  resetFixtureProject();
  await killFixturePreviewProcess();
});

test("revert restores prior preview text after two iterations", async ({ page }) => {
  test.setTimeout(600_000);

  await page.addInitScript((settings) => {
    window.localStorage.clear();
    window.localStorage.setItem("app-factory-settings", JSON.stringify(settings));
    window.localStorage.removeItem("app-factory-projects");
  }, SETTINGS_SNAPSHOT);

  await page.goto("/");
  await expect(page.getByText("Connected")).toBeVisible({ timeout: 30_000 });

  await page.getByText(FIXTURE_PROJECT.name, { exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/project/${FIXTURE_PROJECT.name}$`), {
    timeout: 15_000,
  });

  const frame = previewFrame(page);
  await expect(frame.getByText("Hello from fixture")).toBeVisible({ timeout: 180_000 });

  await sendIteration(page, "Change the preview title to iteration.");
  await expect(frame.getByText("Hello from iteration")).toBeVisible({ timeout: 180_000 });
  await expect(page.getByText(/Applied 1 changes/i)).toBeVisible({ timeout: 120_000 });
  await expect(page.getByText("v2", { exact: true })).toBeVisible({ timeout: 120_000 });

  await sendIteration(page, "Change the preview title again.");
  await expect(frame.getByText("Hello from iteration 2")).toBeVisible({ timeout: 180_000 });
  await expect(page.getByText("v3", { exact: true })).toBeVisible({ timeout: 120_000 });

  // Revert to v2 (first iteration) — v3 is current, v2 is clickable.
  await page.getByText("v2", { exact: true }).click();

  await expect(frame.getByText("Hello from iteration")).toBeVisible({ timeout: 180_000 });
});
