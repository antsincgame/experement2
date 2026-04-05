// Verifies that rapid successive chat messages don't crash the UI, duplicate messages, or corrupt preview state.
import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

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

const APP_LAYOUT = `import { Stack } from "expo-router";
export default function RootLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
`;

const APP_INDEX = `import { Text, View } from "react-native";
export default function HomeScreen() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#F8FAFC" }}>
      <Text testID="fixture-title">Hello from fixture</Text>
    </View>
  );
}
`;

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
  if (!fs.existsSync(templateCachePath)) {
    throw new Error(`Template cache not found: ${templateCachePath}`);
  }

  if (!fs.existsSync(fixturePath)) {
    fs.cpSync(templateCachePath, fixturePath, { recursive: true });
  }

  fs.mkdirSync(path.join(fixturePath, "app"), { recursive: true });
  fs.writeFileSync(path.join(fixturePath, "app", "_layout.tsx"), APP_LAYOUT, "utf-8");
  fs.writeFileSync(path.join(fixturePath, "app", "index.tsx"), APP_INDEX, "utf-8");

  const appJsonPath = path.join(fixturePath, "app.json");
  const appJson = JSON.parse(fs.readFileSync(appJsonPath, "utf-8"));
  appJson.expo.name = FIXTURE_PROJECT.displayName;
  appJson.expo.slug = FIXTURE_PROJECT.name;
  appJson.expo.scheme = FIXTURE_PROJECT.name;
  fs.writeFileSync(appJsonPath, JSON.stringify(appJson, null, 2), "utf-8");
});

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

  // All three user messages should be visible in the chat
  for (const msg of messages) {
    await expect(page.getByText(msg)).toBeVisible({ timeout: 15_000 });
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

  // Wait for preview to load first
  const previewFrame = page
    .locator('iframe[title="App Preview"]')
    .last()
    .contentFrame();
  await expect(previewFrame.getByText("Hello from fixture")).toBeVisible({
    timeout: 180_000,
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
  const iframeCount = await page.locator('iframe[title="App Preview"]').count();
  expect(iframeCount).toBeGreaterThanOrEqual(1);

  // The preview frame should still contain readable content
  const frameContent = await previewFrame.locator("body").innerText().catch(() => "");
  expect(frameContent.length).toBeGreaterThan(0);
});
