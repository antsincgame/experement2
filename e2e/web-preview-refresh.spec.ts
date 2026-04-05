// Verifies that the preview iframe updates correctly during and after a chat iteration.
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

test("preview loads initial fixture content in iframe", async ({ page }) => {
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

  // Wait for the preview iframe to load with initial content
  const previewFrame = page
    .locator('iframe[title="App Preview"]')
    .last()
    .contentFrame();
  await expect(previewFrame.getByText("Hello from fixture")).toBeVisible({
    timeout: 180_000,
  });
});

test("preview updates after sending an iteration", async ({ page }) => {
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

  // Wait for initial preview
  const previewFrame = page
    .locator('iframe[title="App Preview"]')
    .last()
    .contentFrame();
  await expect(previewFrame.getByText("Hello from fixture")).toBeVisible({
    timeout: 180_000,
  });

  // Send iteration via chat (mock LLM will change "Hello from fixture" → "Hello from iteration")
  const chatInput = page.locator('textarea[aria-label="Chat message input"]:visible');
  await chatInput.fill("Change the preview title.");
  await page.locator('[aria-label="Send chat message"]:visible').click();

  // Wait for the preview to reflect the mock LLM's iteration response
  await expect(previewFrame.getByText("Hello from iteration")).toBeVisible({
    timeout: 180_000,
  });

  // Original text should be gone
  await expect(previewFrame.getByText("Hello from fixture")).not.toBeVisible({
    timeout: 5_000,
  });
});

test("preview iframe remains accessible after iteration completes", async ({ page }) => {
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

  const previewFrame = page
    .locator('iframe[title="App Preview"]')
    .last()
    .contentFrame();
  await expect(previewFrame.getByText("Hello from fixture")).toBeVisible({
    timeout: 180_000,
  });

  // Trigger iteration
  const chatInput = page.locator('textarea[aria-label="Chat message input"]:visible');
  await chatInput.fill("Update the title text.");
  await page.locator('[aria-label="Send chat message"]:visible').click();

  // Wait for iteration to complete
  await expect(previewFrame.getByText("Hello from iteration")).toBeVisible({
    timeout: 180_000,
  });

  // Verify the iframe element is still present and accessible (not removed/replaced)
  const iframeCount = await page.locator('iframe[title="App Preview"]').count();
  expect(iframeCount).toBeGreaterThanOrEqual(1);

  // Verify we can still read content from the frame
  const frameText = await previewFrame.locator("body").innerText();
  expect(frameText).toContain("Hello from iteration");
});
