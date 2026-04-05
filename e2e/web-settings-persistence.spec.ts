// Verifies that settings changes persist through drawer close/reopen and survive in localStorage.
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

const openSettings = async (page: import("@playwright/test").Page) => {
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

  await expect(page.getByText(/LM Studio/i).first()).toBeVisible({ timeout: 5_000 });
};

const closeSettings = async (page: import("@playwright/test").Page) => {
  const closeButton = page.locator('[aria-label="Close"], [aria-label="close"]').first();
  const hasClose = await closeButton.isVisible().catch(() => false);
  if (hasClose) {
    await closeButton.click();
  } else {
    await page.keyboard.press("Escape");
  }
  await expect(page.getByText(/LM Studio/i).first()).not.toBeVisible({ timeout: 5_000 });
};

/** Read a specific settings field from localStorage. */
const readSettingsField = (page: import("@playwright/test").Page, field: string) =>
  page.evaluate((f) => {
    const raw = window.localStorage.getItem("app-factory-settings");
    if (!raw) return undefined;
    const parsed = JSON.parse(raw);
    return parsed?.state?.[f];
  }, field);

test("settings drawer opens and shows current values", async ({ page }) => {
  await page.addInitScript((settings) => {
    window.localStorage.clear();
    window.localStorage.setItem("app-factory-settings", JSON.stringify(settings));
    window.localStorage.removeItem("app-factory-projects");
  }, SETTINGS_SNAPSHOT);

  await page.goto("/");
  await expect(page.getByText("Connected")).toBeVisible({ timeout: 30_000 });

  await openSettings(page);

  // Settings drawer should show LM Studio URL, Agent URL labels
  await expect(page.getByText("LM Studio URL")).toBeVisible({ timeout: 5_000 });
  await expect(page.getByText("Agent URL")).toBeVisible({ timeout: 5_000 });
  await expect(page.getByText("Temperature")).toBeVisible({ timeout: 5_000 });
  await expect(page.getByText("Max Tokens")).toBeVisible({ timeout: 5_000 });

  await closeSettings(page);
});

test("URL change persists in localStorage after drawer close", async ({ page }) => {
  await page.addInitScript((settings) => {
    window.localStorage.clear();
    window.localStorage.setItem("app-factory-settings", JSON.stringify(settings));
    window.localStorage.removeItem("app-factory-projects");
  }, SETTINGS_SNAPSHOT);

  await page.goto("/");
  await expect(page.getByText("Connected")).toBeVisible({ timeout: 30_000 });

  // Verify initial URL in localStorage
  const initialUrl = await readSettingsField(page, "lmStudioUrl");
  expect(initialUrl).toBe(MOCK_LLM_URL);

  await openSettings(page);

  // Find all text inputs inside the settings modal.
  // React Native Web renders TextInput as <input> elements.
  // The first input in the settings drawer is LM Studio URL.
  const inputs = page.locator("input[type='text'], input:not([type])").filter({ hasNot: page.locator("[hidden]") });
  const firstInput = inputs.first();
  const hasInput = await firstInput.isVisible({ timeout: 3_000 }).catch(() => false);

  if (hasInput) {
    await firstInput.triple_click();
    await firstInput.fill("http://localhost:9999");

    // Close drawer to trigger zustand persist
    await closeSettings(page);

    // Wait for zustand persist debounce (500ms in settings-drawer + persist write)
    await page.waitForTimeout(1_000);

    // Verify localStorage was updated
    const updatedUrl = await readSettingsField(page, "lmStudioUrl");
    expect(updatedUrl).toBe("http://localhost:9999");
  }
});

test("enhancer toggle persists through close/reopen", async ({ page }) => {
  await page.addInitScript((settings) => {
    window.localStorage.clear();
    window.localStorage.setItem("app-factory-settings", JSON.stringify(settings));
    window.localStorage.removeItem("app-factory-projects");
  }, SETTINGS_SNAPSHOT);

  await page.goto("/");
  await expect(page.getByText("Connected")).toBeVisible({ timeout: 30_000 });

  // Initial state: enhancer is OFF
  const initialEnabled = await readSettingsField(page, "enhancerEnabled");
  expect(initialEnabled).toBe(false);

  await openSettings(page);

  // Click the OFF toggle to turn it ON
  const offButton = page.getByText("OFF", { exact: true }).first();
  const hasOffButton = await offButton.isVisible({ timeout: 3_000 }).catch(() => false);

  if (hasOffButton) {
    await offButton.click();
    await expect(page.getByText("ON", { exact: true }).first()).toBeVisible({ timeout: 3_000 });
  }

  await closeSettings(page);
  await page.waitForTimeout(500);

  // Verify the toggle persisted in localStorage
  const updatedEnabled = await readSettingsField(page, "enhancerEnabled");
  expect(updatedEnabled).toBe(true);

  // Reopen and verify the UI still shows ON
  await openSettings(page);
  if (hasOffButton) {
    await expect(page.getByText("ON", { exact: true }).first()).toBeVisible({ timeout: 3_000 });
  }
  await closeSettings(page);
});

test("localStorage settings structure is valid on page load", async ({ page }) => {
  await page.addInitScript((settings) => {
    window.localStorage.clear();
    window.localStorage.setItem("app-factory-settings", JSON.stringify(settings));
    window.localStorage.removeItem("app-factory-projects");
  }, SETTINGS_SNAPSHOT);

  await page.goto("/");
  await expect(page.getByText("Connected")).toBeVisible({ timeout: 30_000 });

  // Verify the full settings structure in localStorage
  const stored = await page.evaluate(() => {
    const raw = window.localStorage.getItem("app-factory-settings");
    return raw ? JSON.parse(raw) : null;
  });

  expect(stored).toBeTruthy();
  expect(stored.state).toBeTruthy();
  expect(typeof stored.state.lmStudioUrl).toBe("string");
  expect(typeof stored.state.agentUrl).toBe("string");
  expect(typeof stored.state.temperature).toBe("number");
  expect(typeof stored.state.maxTokens).toBe("number");
  expect(typeof stored.state.enhancerEnabled).toBe("boolean");

  // Zustand persist should not serialize functions
  expect(stored.state.setLmStudioUrl).toBeUndefined();
  expect(stored.state.addErrorLog).toBeUndefined();
});
