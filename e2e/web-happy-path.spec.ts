// Drives the real browser/UI happy-path for opening an existing project, starting preview, and applying one iteration.
import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

const AGENT_URL = "http://127.0.0.1:3100";
const MOCK_LLM_URL = "http://127.0.0.1:11434";
const EXISTING_PROJECT_FIXTURE = {
  name: "e2e-existing-project",
  displayName: "E2E Existing Project",
};

const repoRoot = process.cwd();
const workspaceRoot = path.join(repoRoot, "workspace");
const templateCachePath = path.join(workspaceRoot, "template_cache");
const fixturePath = path.join(workspaceRoot, EXISTING_PROJECT_FIXTURE.name);

const APP_LAYOUT = `// Defines a minimal Expo Router layout for the deterministic browser E2E fixture.
import { Stack } from "expo-router";

export default function RootLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
`;

const APP_INDEX = `// Renders stable preview text so the browser E2E can assert preview and iteration updates.
import { Text, View } from "react-native";

export default function HomeScreen() {
  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#F8FAFC",
      }}
    >
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
  appJson.expo.name = EXISTING_PROJECT_FIXTURE.displayName;
  appJson.expo.slug = EXISTING_PROJECT_FIXTURE.name;
  appJson.expo.scheme = EXISTING_PROJECT_FIXTURE.name;
  fs.writeFileSync(appJsonPath, JSON.stringify(appJson, null, 2), "utf-8");
});

test("should open an existing project, start preview, and apply one iteration", async ({ page }) => {
  await page.addInitScript((settings) => {
    window.localStorage.clear();
    window.localStorage.setItem("app-factory-settings", JSON.stringify(settings));
    window.localStorage.removeItem("app-factory-projects");
  }, SETTINGS_SNAPSHOT);

  await page.goto("/");

  await expect(page.getByText("Connected")).toBeVisible({ timeout: 30_000 });
  await page.getByText(EXISTING_PROJECT_FIXTURE.name, { exact: true }).click();

  await expect(page).toHaveURL(
    new RegExp(`/project/${EXISTING_PROJECT_FIXTURE.name}$`),
    { timeout: 30_000 }
  );

  const previewFrame = page
    .locator('iframe[title="App Preview"]')
    .last()
    .contentFrame();
  await expect(previewFrame.getByText("Hello from fixture")).toBeVisible({
    timeout: 180_000,
  });

  const chatInput = page.locator('textarea[aria-label="Chat message input"]:visible');
  await chatInput.fill("Change the preview title to Hello from iteration.");
  await page.locator('[aria-label="Send chat message"]:visible').click();

  await expect(previewFrame.getByText("Hello from iteration")).toBeVisible({
    timeout: 180_000,
  });
});
