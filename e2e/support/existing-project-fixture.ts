// Provisions the deterministic "existing project" the browser E2E opens for preview
// and iteration. Centralized here (and built once in global-setup) so every spec sees
// a ready fixture instead of each racing the agent's async template-cache warm-up.
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const workspaceRoot = path.join(repoRoot, "workspace");
const templateCachePath = path.join(workspaceRoot, "template_cache");

export const EXISTING_PROJECT_FIXTURE = {
  name: "e2e-existing-project",
  displayName: "E2E Existing Project",
};

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

/**
 * The agent warms workspace/template_cache (an npm install of the Expo deps) lazily on
 * startup, so /health is up well before node_modules exists. The fixture is a copy of
 * that cache, so we must wait for the install to finish before copying — otherwise the
 * fixture gets an incomplete node_modules and Metro can never bundle the preview.
 */
export const waitForTemplateCacheReady = async (timeoutMs = 300_000): Promise<void> => {
  const nodeModulesPath = path.join(templateCachePath, "node_modules");
  const expoMarker = path.join(nodeModulesPath, "expo", "package.json");
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (fs.existsSync(expoMarker)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  throw new Error(
    `Template cache not ready (no node_modules/expo) after ${timeoutMs}ms: ${templateCachePath}`
  );
};

/**
 * Build (or refresh) the existing-project fixture from the warm template cache.
 * Idempotent: safe to call from global-setup and from a spec's beforeAll.
 */
export const ensureExistingProjectFixture = (): void => {
  if (!fs.existsSync(templateCachePath)) {
    throw new Error(`Template cache not found: ${templateCachePath}`);
  }

  if (!fs.existsSync(fixturePath)) {
    // The warm template cache's node_modules contains platform-specific optional deps
    // (e.g. lightningcss-linux-arm64-gnu on an x64 CI runner) left as broken/dangling
    // entries. fs.cpSync's recursive walk throws ENOENT when it lstats them, so skip any
    // symlink whose target is missing (and any entry that can't be stat'd at all). The
    // platform-matching variant is a real file/dir and is copied normally.
    fs.cpSync(templateCachePath, fixturePath, {
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
};
