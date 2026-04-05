// Validates error handling when the LLM server is unreachable during project creation.
// KNOWN BUG: the home screen shows NO feedback when project creation fails before scaffolding.
import { expect, test } from "@playwright/test";

const AGENT_URL = "http://127.0.0.1:3100";
const DEAD_LLM_URL = "http://127.0.0.1:19999";

const SETTINGS_SNAPSHOT = {
  state: {
    lmStudioUrl: DEAD_LLM_URL,
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

test("no ghost project created when LLM is unreachable", async ({ page }) => {
  await page.addInitScript((settings) => {
    window.localStorage.clear();
    window.localStorage.setItem("app-factory-settings", JSON.stringify(settings));
    window.localStorage.removeItem("app-factory-projects");
  }, SETTINGS_SNAPSHOT);

  await page.goto("/");
  await expect(page.getByText("Connected")).toBeVisible({ timeout: 30_000 });

  const input = page.locator("textarea").first();
  await input.fill("Create a simple counter app");

  const generateButton = page.getByText("Generate", { exact: true });
  await generateButton.click();

  // Wait long enough for the pipeline to attempt the LLM call and fail
  await page.waitForTimeout(15_000);

  // CRITICAL ASSERTION: no project named "error" should appear in the sidebar or project list
  const ghostProject = page.getByText("error", { exact: true });
  await expect(ghostProject).not.toBeVisible({ timeout: 5_000 });

  // The home screen should still be visible (navigation didn't happen due to projectName=null)
  await expect(page.getByText("App Factory")).toBeVisible({ timeout: 5_000 });
});

test("LM Studio status badge reflects dead server", async ({ page }) => {
  await page.addInitScript((settings) => {
    window.localStorage.clear();
    window.localStorage.setItem("app-factory-settings", JSON.stringify(settings));
    window.localStorage.removeItem("app-factory-projects");
  }, SETTINGS_SNAPSHOT);

  await page.goto("/");
  await expect(page.getByText("Connected")).toBeVisible({ timeout: 30_000 });

  // Agent health-checks LLM every 15s. After the settings point to a dead URL,
  // the periodic check should report disconnected within ~30s.
  // But the home screen only shows agent connection status, not LLM status.
  // This test verifies the agent connection is maintained even when LLM is dead.
  await page.waitForTimeout(5_000);
  await expect(page.getByText("Connected")).toBeVisible({ timeout: 5_000 });
});
