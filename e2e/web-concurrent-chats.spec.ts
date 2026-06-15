// Verifies that rapid successive chat messages don't crash the UI, duplicate messages, or corrupt preview state.
import { expect, test } from "@playwright/test";
import { ensureExistingProjectFixture } from "./support/existing-project-fixture";
const AGENT_URL = "http://127.0.0.1:3100";
const MOCK_LLM_URL = "http://127.0.0.1:1235";
const FIXTURE_PROJECT = {
  name: "e2e-existing-project",
  displayName: "E2E Existing Project",
};

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

test.beforeAll(() => {
  ensureExistingProjectFixture();
});

const killFixturePreviewProcess = async (): Promise<void> => {
  try {
    await fetch(`${AGENT_URL}/process/${encodeURIComponent(FIXTURE_PROJECT.name)}/kill`, {
      method: "POST",
      headers: { "x-app-factory-confirm": "kill-preview-process" },
    });
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  } catch {
    // Agent down — spec fails on connect anyway.
  }
};

test("rapid messages don't crash the UI", async ({ page }) => {
  await page.addInitScript((settings) => {
    window.localStorage.clear();
    window.localStorage.setItem("app-factory-settings", JSON.stringify(settings));
    window.localStorage.removeItem("app-factory-projects");
  }, SETTINGS_SNAPSHOT);

  await page.goto("/");
  await expect(page.getByText("Connected")).toBeVisible({ timeout: 30_000 });

  await page.getByText(FIXTURE_PROJECT.name, { exact: true }).click();
  await expect(page).toHaveURL(
    new RegExp(`/project/${FIXTURE_PROJECT.name}$`),
    { timeout: 15_000 }
  );

  const chatInput = page.locator('textarea[aria-label="Chat message input"]:visible');
  await expect(chatInput).toBeVisible({ timeout: 10_000 });
  const sendButton = page.locator('[aria-label="Send chat message"]:visible');

  // Send 3 messages in rapid succession without waiting for responses
  const messages = [
    "First rapid message",
    "Second rapid message",
    "Third rapid message",
  ];

  for (const msg of messages) {
    await chatInput.fill(msg);
    await sendButton.click();
    // Minimal delay — just enough for React to process the click
    await page.waitForTimeout(500);
  }

  // Wait for all messages to be processed
  await page.waitForTimeout(10_000);

  // All three user messages should be visible in the chat (`.first()` — duplicate in message preview chip)
  for (const msg of messages) {
    await expect(page.getByText(msg, { exact: true }).first()).toBeVisible({ timeout: 15_000 });
  }

  // Page should not have crashed — basic UI elements still present
  await expect(page.getByText("Chat").last()).toBeVisible({ timeout: 5_000 });
  await expect(page.getByText("Preview").last()).toBeVisible({ timeout: 5_000 });
});

test("no duplicate messages after rapid sending", async ({ page }) => {
  await page.addInitScript((settings) => {
    window.localStorage.clear();
    window.localStorage.setItem("app-factory-settings", JSON.stringify(settings));
    window.localStorage.removeItem("app-factory-projects");
  }, SETTINGS_SNAPSHOT);

  await page.goto("/");
  await expect(page.getByText("Connected")).toBeVisible({ timeout: 30_000 });

  await page.getByText(FIXTURE_PROJECT.name, { exact: true }).click();
  await expect(page).toHaveURL(
    new RegExp(`/project/${FIXTURE_PROJECT.name}$`),
    { timeout: 15_000 }
  );

  const chatInput = page.locator('textarea[aria-label="Chat message input"]:visible');
  await expect(chatInput).toBeVisible({ timeout: 10_000 });
  const sendButton = page.locator('[aria-label="Send chat message"]:visible');

  const uniqueMessage = `Unique test message ${Date.now()}`;
  await chatInput.fill(uniqueMessage);
  await sendButton.click();

  // Wait for the message to appear
  await expect(page.getByText(uniqueMessage)).toBeVisible({ timeout: 15_000 });

  // Wait a bit more for any potential duplicates to appear
  await page.waitForTimeout(5_000);

  // Count occurrences of the message text — should be exactly 1
  const messageCount = await page.getByText(uniqueMessage).count();
  expect(messageCount).toBe(1);
});

test("preview iframe survives rapid iteration requests", async ({ page }) => {
  test.setTimeout(600_000);
  await killFixturePreviewProcess();

  await page.addInitScript((settings) => {
    window.localStorage.clear();
    window.localStorage.setItem("app-factory-settings", JSON.stringify(settings));
    window.localStorage.removeItem("app-factory-projects");
  }, SETTINGS_SNAPSHOT);

  await page.goto("/");
  await expect(page.getByText("Connected")).toBeVisible({ timeout: 30_000 });

  await page.getByText(FIXTURE_PROJECT.name, { exact: true }).click();
  await expect(page).toHaveURL(
    new RegExp(`/project/${FIXTURE_PROJECT.name}$`),
    { timeout: 15_000 }
  );

  // Wait for preview to load first (keep-alive pool uses Preview ${projectName}, not App Preview)
  const previewFrame = page.frameLocator(`iframe[title="Preview ${FIXTURE_PROJECT.name}"]`);
  await expect(previewFrame.getByText("Hello from fixture")).toBeVisible({
    timeout: 300_000,
  });

  const chatInput = page.locator('textarea[aria-label="Chat message input"]:visible');
  const sendButton = page.locator('[aria-label="Send chat message"]:visible');

  // Send two rapid iteration requests
  await chatInput.fill("Change title to something new");
  await sendButton.click();
  await page.waitForTimeout(1_000);
  await chatInput.fill("Also update the colors");
  await sendButton.click();

  // Wait for iterations to process
  await page.waitForTimeout(30_000);

  // The iframe should still be present and accessible (not broken)
  const iframeCount = await page.locator(`iframe[title="Preview ${FIXTURE_PROJECT.name}"]`).count();
  expect(iframeCount).toBeGreaterThanOrEqual(1);

  // The preview frame should still contain readable content
  const frameContent = await previewFrame.locator("body").innerText().catch(() => "");
  expect(frameContent.length).toBeGreaterThan(0);
});
