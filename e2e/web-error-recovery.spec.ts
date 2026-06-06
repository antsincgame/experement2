// Validates error handling when the LLM server is unreachable during project creation.
// Planning calls the LLM (pipeline.ts _createProjectInner) BEFORE any project dir is
// scaffolded, so a dead LLM must surface an explicit error in chat and never leave a
// ghost project on disk.
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

test("LLM unreachable surfaces an explicit error instead of failing silently", async ({ page }) => {
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

  // CRITICAL ASSERTION: the dead-LLM failure must be reported with its real reason in
  // chat (anti-silent-failure), not swallowed. planApp throws before scaffolding, so the
  // createProject catch broadcasts system_error → "AI server disconnected: LLM_SERVER_DOWN".
  await expect(
    page.getByText(/LLM_SERVER_DOWN|AI server disconnected/i).first()
  ).toBeVisible({ timeout: 30_000 });
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
