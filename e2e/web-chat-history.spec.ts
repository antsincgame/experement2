// Verifies that chat messages persist when navigating away from a project and back.
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

test("user message visible after sending in project chat", async ({ page }) => {
  await page.addInitScript((settings) => {
    window.localStorage.clear();
    window.localStorage.setItem("app-factory-settings", JSON.stringify(settings));
    window.localStorage.removeItem("app-factory-projects");
  }, SETTINGS_SNAPSHOT);

  await page.goto("/");
  await expect(page.getByText("Connected")).toBeVisible({ timeout: 30_000 });

  // Navigate to project
  await page.getByText(FIXTURE_PROJECT.name, { exact: true }).click();
  await expect(page).toHaveURL(
    new RegExp(`/project/${FIXTURE_PROJECT.name}$`),
    { timeout: 15_000 }
  );

  // Send a chat message
  const chatInput = page.locator('textarea[aria-label="Chat message input"]:visible');
  await expect(chatInput).toBeVisible({ timeout: 10_000 });
  await chatInput.fill("Make the background blue");
  await page.locator('[aria-label="Send chat message"]:visible').click();

  // Verify the user message appears in the chat area
  await expect(page.getByText("Make the background blue")).toBeVisible({ timeout: 15_000 });
});

test("chat messages survive navigation away and back", async ({ page }) => {
  await page.addInitScript((settings) => {
    window.localStorage.clear();
    window.localStorage.setItem("app-factory-settings", JSON.stringify(settings));
    window.localStorage.removeItem("app-factory-projects");
  }, SETTINGS_SNAPSHOT);

  await page.goto("/");
  await expect(page.getByText("Connected")).toBeVisible({ timeout: 30_000 });

  // Navigate to project
  await page.getByText(FIXTURE_PROJECT.name, { exact: true }).click();
  await expect(page).toHaveURL(
    new RegExp(`/project/${FIXTURE_PROJECT.name}$`),
    { timeout: 15_000 }
  );

  // Send a message
  const chatInput = page.locator('textarea[aria-label="Chat message input"]:visible');
  await expect(chatInput).toBeVisible({ timeout: 10_000 });
  await chatInput.fill("Add a login screen");
  await page.locator('[aria-label="Send chat message"]:visible').click();

  // Wait for message to appear
  await expect(page.getByText("Add a login screen")).toBeVisible({ timeout: 15_000 });

  // Wait for assistant to start responding (iteration takes time with mock LLM)
  await page.waitForTimeout(5_000);

  // Navigate home
  await page.goto("/");
  await expect(page.getByText(FIXTURE_PROJECT.name)).toBeVisible({ timeout: 10_000 });

  // Navigate back to project
  await page.getByText(FIXTURE_PROJECT.name, { exact: true }).click();
  await expect(page).toHaveURL(
    new RegExp(`/project/${FIXTURE_PROJECT.name}$`),
    { timeout: 15_000 }
  );

  // Verify the user message is still visible
  await expect(page.getByText("Add a login screen")).toBeVisible({ timeout: 15_000 });
});

test("multiple messages maintain order", async ({ page }) => {
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

  // Send first message and wait for it to appear
  await chatInput.fill("First change request");
  await page.locator('[aria-label="Send chat message"]:visible').click();
  await expect(page.getByText("First change request")).toBeVisible({ timeout: 15_000 });

  // Wait for iteration to complete before sending next
  await page.waitForTimeout(10_000);

  // Send second message
  await chatInput.fill("Second change request");
  await page.locator('[aria-label="Send chat message"]:visible').click();
  await expect(page.getByText("Second change request")).toBeVisible({ timeout: 15_000 });

  // Both messages should be visible and in order
  const allText = await page.evaluate(() => document.body.innerText);
  const firstIdx = allText.indexOf("First change request");
  const secondIdx = allText.indexOf("Second change request");

  expect(firstIdx).toBeGreaterThanOrEqual(0);
  expect(secondIdx).toBeGreaterThanOrEqual(0);
  expect(firstIdx).toBeLessThan(secondIdx);
});
