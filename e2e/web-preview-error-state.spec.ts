// Verifies that a broken Metro build shows preview failure UI instead of a stale or false-success iframe.
import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

const AGENT_URL = "http://127.0.0.1:3100";
const MOCK_LLM_URL = "http://127.0.0.1:1235";
const FIXTURE_PROJECT = {
  name: "e2e-broken-preview",
  displayName: "E2E Broken Preview",
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

const BROKEN_APP_INDEX = `import { MissingWidget } from "./missing-widget";
export default function HomeScreen() {
  return <MissingWidget />;
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
  fs.writeFileSync(path.join(fixturePath, "app", "index.tsx"), BROKEN_APP_INDEX, "utf-8");

  const appJsonPath = path.join(fixturePath, "app.json");
  const appJson = JSON.parse(fs.readFileSync(appJsonPath, "utf-8"));
  appJson.expo.name = FIXTURE_PROJECT.displayName;
  appJson.expo.slug = FIXTURE_PROJECT.name;
  appJson.expo.scheme = FIXTURE_PROJECT.name;
  fs.writeFileSync(appJsonPath, JSON.stringify(appJson, null, 2), "utf-8");
});

test("broken preview build shows explicit error state without iframe", async ({ page }) => {
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

  await expect(page.getByText("Preview unavailable").last()).toBeVisible({
    timeout: 180_000,
  });
  await expect(page.getByText(/missing-widget|preview failed|metro/i).last()).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.locator('iframe[title="App Preview"]')).toHaveCount(0);
});
