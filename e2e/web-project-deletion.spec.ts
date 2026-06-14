// Verifies project deletion via Clear All and re-creation flow.
// Clear All tests use a throwaway project and restore the shared fixture afterward
// so other specs are not starved of e2e-existing-project on disk.
import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { ensureExistingProjectFixture } from "./support/existing-project-fixture";

const AGENT_URL = "http://127.0.0.1:3100";
const MOCK_LLM_URL = "http://127.0.0.1:1235";
const FIXTURE_PROJECT = {
  name: "e2e-existing-project",
  displayName: "E2E Existing Project",
};
const THROWAWAY_PROJECT = {
  name: "e2e-throwaway-deletion",
  displayName: "E2E Throwaway Deletion",
};

const repoRoot = process.cwd();
const workspaceRoot = path.join(repoRoot, "workspace");
const templateCachePath = path.join(workspaceRoot, "template_cache");
const fixturePath = path.join(workspaceRoot, FIXTURE_PROJECT.name);
const throwawayPath = path.join(workspaceRoot, THROWAWAY_PROJECT.name);

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

const writeMinimalApp = (projectPath: string, displayName: string, slug: string): void => {
  fs.mkdirSync(path.join(projectPath, "app"), { recursive: true });
  fs.writeFileSync(path.join(projectPath, "app", "_layout.tsx"), APP_LAYOUT, "utf-8");
  fs.writeFileSync(path.join(projectPath, "app", "index.tsx"), APP_INDEX, "utf-8");

  const appJsonPath = path.join(projectPath, "app.json");
  const appJson = fs.existsSync(appJsonPath)
    ? JSON.parse(fs.readFileSync(appJsonPath, "utf-8"))
    : { expo: {} };
  appJson.expo.name = displayName;
  appJson.expo.slug = slug;
  appJson.expo.scheme = slug;
  fs.writeFileSync(appJsonPath, JSON.stringify(appJson, null, 2), "utf-8");
};

const copyTemplateTo = (targetPath: string): void => {
  if (fs.existsSync(targetPath)) {
    fs.rmSync(targetPath, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
  fs.cpSync(templateCachePath, targetPath, {
    recursive: true,
    filter: (src) => {
      try {
        const stat = fs.lstatSync(src);
        if (stat.isSymbolicLink() && !fs.existsSync(src)) return false;
      } catch {
        return false;
      }
      return true;
    },
  });
};

const createThrowawayProject = (): void => {
  if (!fs.existsSync(templateCachePath)) {
    throw new Error(`Template cache not found: ${templateCachePath}`);
  }
  copyTemplateTo(throwawayPath);
  writeMinimalApp(throwawayPath, THROWAWAY_PROJECT.displayName, THROWAWAY_PROJECT.name);
};

const restoreSharedFixture = (): void => {
  if (fs.existsSync(throwawayPath)) {
    try {
      fs.rmSync(throwawayPath, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
    } catch {
      // Throwaway cleanup is best-effort when Metro holds file locks on Windows.
    }
  }
  ensureExistingProjectFixture();
};

/** Release Metro file handles before Clear All — otherwise DELETE /all fails on Windows. */
const killWorkspacePreviewProcesses = async (): Promise<void> => {
  if (!fs.existsSync(workspaceRoot)) {
    return;
  }
  for (const entry of fs.readdirSync(workspaceRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === "template_cache" || entry.name.startsWith(".")) {
      continue;
    }
    await fetch(`${AGENT_URL}/process/${encodeURIComponent(entry.name)}/kill`, {
      method: "POST",
      headers: { "x-app-factory-confirm": "kill-preview-process" },
    }).catch(() => undefined);
  }
  await new Promise((resolve) => setTimeout(resolve, 2_000));
};

const clickClearAllAndAwaitDelete = async (
  page: import("@playwright/test").Page,
): Promise<void> => {
  await killWorkspacePreviewProcesses();

  const clearAllButton = page.getByText("Clear All", { exact: true });
  await expect(clearAllButton).toBeVisible({ timeout: 5_000 });

  const deleteResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/api/projects/all") &&
      response.request().method() === "DELETE",
    { timeout: 120_000 },
  );
  await clearAllButton.click();
  const response = await deleteResponse;
  expect(response.ok(), `DELETE /api/projects/all failed: ${response.status()}`).toBe(true);
};

test.beforeAll(() => {
  restoreSharedFixture();
});

test.afterAll(() => {
  restoreSharedFixture();
});

test("fixture project appears in project list", async ({ page }) => {
  restoreSharedFixture();

  await page.addInitScript((settings) => {
    window.localStorage.clear();
    window.localStorage.setItem("app-factory-settings", JSON.stringify(settings));
    window.localStorage.removeItem("app-factory-projects");
  }, SETTINGS_SNAPSHOT);

  await page.goto("/");
  await expect(page.getByText("Connected")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(FIXTURE_PROJECT.name)).toBeVisible({ timeout: 10_000 });
});

test("Clear All removes projects from the list", async ({ page }) => {
  restoreSharedFixture();
  createThrowawayProject();

  await page.addInitScript((settings) => {
    window.localStorage.clear();
    window.localStorage.setItem("app-factory-settings", JSON.stringify(settings));
    window.localStorage.removeItem("app-factory-projects");
  }, SETTINGS_SNAPSHOT);

  await page.goto("/");
  await expect(page.getByText("Connected")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(THROWAWAY_PROJECT.name)).toBeVisible({ timeout: 10_000 });

  await clickClearAllAndAwaitDelete(page);

  const storeState = await page.evaluate(() => {
    const raw = window.localStorage.getItem("app-factory-projects");
    return raw ? JSON.parse(raw) : null;
  });

  expect(storeState?.state?.projectList?.length ?? 0).toBe(0);
  restoreSharedFixture();
});

test("filesystem throwaway project is deleted after Clear All", async ({ page }) => {
  restoreSharedFixture();
  createThrowawayProject();

  await page.addInitScript((settings) => {
    window.localStorage.clear();
    window.localStorage.setItem("app-factory-settings", JSON.stringify(settings));
    window.localStorage.removeItem("app-factory-projects");
  }, SETTINGS_SNAPSHOT);

  await page.goto("/");
  await expect(page.getByText("Connected")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(THROWAWAY_PROJECT.name)).toBeVisible({ timeout: 10_000 });

  await clickClearAllAndAwaitDelete(page);

  expect(fs.existsSync(throwawayPath)).toBe(false);
  expect(fs.existsSync(templateCachePath)).toBe(true);
  restoreSharedFixture();
});
