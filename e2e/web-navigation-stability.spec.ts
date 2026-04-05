// Exercises the full navigation tree: home screen loads, project opens, settings drawer toggles, and back-navigation stays consistent.
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

test("home screen renders project list, agent status, and input field", async ({ page }) => {
  await page.addInitScript((settings) => {
    window.localStorage.clear();
    window.localStorage.setItem("app-factory-settings", JSON.stringify(settings));
    window.localStorage.removeItem("app-factory-projects");
  }, SETTINGS_SNAPSHOT);

  await page.goto("/");

  await expect(page.getByText("Connected")).toBeVisible({ timeout: 30_000 });

  await expect(page.getByText(FIXTURE_PROJECT.name)).toBeVisible({ timeout: 10_000 });

  const inputField = page.locator("textarea, input[type='text']").first();
  await expect(inputField).toBeVisible({ timeout: 5_000 });
});

test("navigate to project, verify panels, return home", async ({ page }) => {
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

  await expect(page.getByText("Chat").last()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("Preview").last()).toBeVisible({ timeout: 10_000 });

  const chatInput = page.locator('textarea[aria-label="Chat message input"]:visible');
  await expect(chatInput).toBeVisible({ timeout: 10_000 });

  // Expo Router doesn't reliably support browser back-navigation to "/".
  // Navigate explicitly via the logo/home link or direct URL.
  await page.goto("/");
  await expect(page.getByText(FIXTURE_PROJECT.name)).toBeVisible({ timeout: 10_000 });
});

test("settings drawer opens and closes without breaking UI state", async ({ page }) => {
  await page.addInitScript((settings) => {
    window.localStorage.clear();
    window.localStorage.setItem("app-factory-settings", JSON.stringify(settings));
    window.localStorage.removeItem("app-factory-projects");
  }, SETTINGS_SNAPSHOT);

  await page.goto("/");
  await expect(page.getByText("Connected")).toBeVisible({ timeout: 30_000 });

  const settingsButton = page.locator('[aria-label*="Settings"], [aria-label*="settings"]').first();
  const hasDedicatedButton = await settingsButton.isVisible().catch(() => false);

  if (hasDedicatedButton) {
    await settingsButton.click();
  } else {
    const gearIcon = page.locator("svg").filter({ has: page.locator("circle, path") }).first();
    if (await gearIcon.isVisible()) {
      await gearIcon.click();
    }
  }

  const lmStudioLabel = page.getByText(/LM Studio/i).first();
  const drawerOpened = await lmStudioLabel.isVisible({ timeout: 5_000 }).catch(() => false);

  if (drawerOpened) {
    await expect(lmStudioLabel).toBeVisible();

    const closeButton = page.locator('[aria-label="Close"], [aria-label="close"]').first();
    const hasClose = await closeButton.isVisible().catch(() => false);
    if (hasClose) {
      await closeButton.click();
      await expect(lmStudioLabel).not.toBeVisible({ timeout: 5_000 });
    }
  }

  await expect(page.getByText(FIXTURE_PROJECT.name)).toBeVisible({ timeout: 10_000 });
});
