// Builds generated Expo templates from the shared contract so runtime scaffolding stays version-locked with prompts.
import fs from "fs";
import path from "path";
import { getWorkspaceRoot, cloneTemplateInto, getProjectPath } from "./file-manager.js";
import { npmInstall } from "./process-manager.js";
import {
  TEMPLATE_PACKAGE_DEPENDENCIES,
  TEMPLATE_PACKAGE_DEV_DEPENDENCIES,
  TEMPLATE_PACKAGE_SCRIPTS,
  WEB_INCOMPATIBLE_MODULES,
} from "../lib/generation-contract.js";
import { validateDependencies } from "../lib/dependency-validator.js";
import { SCAFFOLD_UI_FILES } from "../lib/scaffold-ui.js";
import { SCAFFOLD_DB_FILES } from "../lib/scaffold-db.js";

const TEMPLATE_DIR_NAME = "template_cache";

/** The blessed source surfaces (UI kit + data layer) every project receives. */
const SCAFFOLD_FILES: Record<string, string> = {
  ...SCAFFOLD_UI_FILES,
  ...SCAFFOLD_DB_FILES,
};

/** Write the shared UI kit (src/ui/*) and data layer (src/services/*) into a
 *  project or template root. Idempotent. */
const writeScaffoldUiFiles = (root: string): void => {
  for (const [relPath, content] of Object.entries(SCAFFOLD_FILES)) {
    const fullPath = path.join(root, relPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, "utf-8");
  }
};

// ── Web preview safety: stub native-only modules on web ───────────────────────
// The live preview runs on Expo WEB. Native-only device modules (expo-contacts,
// expo-camera, react-native-maps, ...) crash the Metro web bundle at module load
// (their web entry reads native constants off undefined), killing the WHOLE preview
// with no fallback — and autofix can't help (the failure is in node_modules). This
// blocks build success, which in turn blocks the auto-polish + learned-exemplar
// stages (they only run after a successful build). The metro.config.js below aliases
// each web-incompatible module to a web-safe stub ON WEB only, so the bundle always
// builds no matter where an app imports them; iOS/Android resolve the real module.

/** A web-safe replacement module: never crashes at load, returns benign empty values. */
export const NATIVE_MODULE_WEB_STUB = `// AUTO-GENERATED — do not edit.
// Web-safe stub for native-only modules (expo-contacts, expo-camera, expo-location,
// expo-sensors, react-native-maps, ...). On WEB these device APIs are unavailable and
// their real web builds crash Metro at load (e.g. reading PermissionStatus.UNDETERMINED
// off undefined). metro.config.js aliases those modules to THIS file on web, so the
// bundle always builds and the app renders. iOS/Android are unaffected (real module).

// Benign result for any async device call (permissions, lists, pickers, geolocation).
var EMPTY_RESULT = {
  status: "undetermined",
  granted: false,
  canAskAgain: true,
  expires: "never",
  data: [],
  assets: [],
  canceled: true,
  coords: { latitude: 0, longitude: 0, accuracy: 0, altitude: 0, heading: 0, speed: 0 },
};

// Uppercase exports double as (a) enum namespaces — any constant reads as a string —
// and (b) React components — rendering one produces nothing instead of crashing.
function makeDual() {
  return new Proxy(function () { return null; }, {
    get: function (_t, prop) {
      return typeof prop === "symbol" ? undefined : "undetermined";
    },
    apply: function () { return null; },
  });
}

// Lowercase exports are treated as async device calls resolving to an empty result.
function asyncNoop() {
  return Promise.resolve(EMPTY_RESULT);
}

var stub = new Proxy(function () { return null; }, {
  get: function (_t, prop) {
    if (prop === "__esModule") return true;
    if (prop === "default") return stub;
    if (typeof prop === "symbol") return undefined;
    return /^[A-Z]/.test(String(prop)) ? makeDual() : asyncNoop;
  },
  apply: function () { return null; },
});

module.exports = stub;
`;

/** metro.config.js that aliases web-incompatible native modules to the stub on web. */
export const buildMetroConfig = (): string => `const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

// Native-only device modules crash the Expo WEB bundle (their web entry reads native
// constants like PermissionStatus.UNDETERMINED at load). Alias them to a web-safe stub
// ON WEB so the bundle always builds; iOS/Android use the real module unchanged.
const WEB_STUBBED_MODULES = new Set(${JSON.stringify([...WEB_INCOMPATIBLE_MODULES])});
const NATIVE_STUB = path.resolve(__dirname, "web-stubs/native-module-stub.js");

const bareName = (name) =>
  name.startsWith("@") ? name.split("/").slice(0, 2).join("/") : name.split("/")[0];

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === "web" && WEB_STUBBED_MODULES.has(bareName(moduleName))) {
    return { type: "sourceFile", filePath: NATIVE_STUB };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
`;

/**
 * Files that make the WEB preview crash-proof. Written PER-PROJECT (not just at
 * template warm-up) so projects cloned from an older warm cache also get them —
 * mirrors writeScaffoldUiFiles.
 */
const writeRuntimeSafetyFiles = (root: string): void => {
  const files: Record<string, string> = {
    "metro.config.js": buildMetroConfig(),
    "web-stubs/native-module-stub.js": NATIVE_MODULE_WEB_STUB,
  };
  for (const [relPath, content] of Object.entries(files)) {
    const fullPath = path.join(root, relPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, "utf-8");
  }
};

const BOILERPLATE_FILES: Record<string, string> = {
  "app.json": JSON.stringify(
    {
      expo: {
        name: "generated-app",
        slug: "generated-app",
        version: "1.0.0",
        orientation: "portrait",
        scheme: "generated-app",
        userInterfaceStyle: "automatic",
        web: { output: "static" },
        plugins: ["expo-router"],
        experiments: { typedRoutes: true },
      },
    },
    null,
    2
  ),

  "package.json": JSON.stringify(
    {
      name: "generated-app",
      main: "expo-router/entry",
      version: "1.0.0",
      private: true,
      scripts: TEMPLATE_PACKAGE_SCRIPTS,
      dependencies: TEMPLATE_PACKAGE_DEPENDENCIES,
      devDependencies: TEMPLATE_PACKAGE_DEV_DEPENDENCIES,
    },
    null,
    2
  ),

  "tsconfig.json": JSON.stringify(
    {
      extends: "expo/tsconfig.base",
      compilerOptions: {
        strict: true,
        skipLibCheck: true,
        paths: { "@/*": ["./src/*"] },
      },
      include: ["**/*.ts", "**/*.tsx", ".expo/types/**/*.ts", "expo-env.d.ts"],
    },
    null,
    2
  ),

  "babel.config.js": `module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: [
      [
        "@tamagui/babel-plugin",
        {
          components: ["tamagui"],
          config: "./tamagui.config.ts",
          logTimings: true,
        },
      ],
      "react-native-reanimated/plugin",
    ],
  };
};
`,

  "tamagui.config.ts": `import { config } from '@tamagui/config/v3'
import { createTamagui } from 'tamagui'

const PRIMARY = '#7C4DFF'

const tamaguiConfig = createTamagui({
  ...config,
  themes: {
    ...config.themes,
    light: { ...config.themes.light, primary: PRIMARY },
    dark: { ...config.themes.dark, primary: PRIMARY },
  },
})

export type AppConfig = typeof tamaguiConfig

declare module 'tamagui' {
  interface TamaguiCustomConfig extends AppConfig {}
}

export default tamaguiConfig
`,

  "expo-env.d.ts": `/// <reference types="expo/types" />
`,

  ".gitignore": `node_modules/
.expo/
dist/
*.tsbuildinfo
.env
`,
};

let cacheReady = false;
let cacheInitPromise: Promise<void> | null = null;

const getTemplatePath = (): string =>
  path.join(getWorkspaceRoot(), TEMPLATE_DIR_NAME);

export const initTemplateCache = async (): Promise<void> => {
  if (cacheReady) return;
  if (cacheInitPromise) return cacheInitPromise;

  cacheInitPromise = (async () => {
    try {
      const templatePath = getTemplatePath();
      const nodeModulesPath = path.join(templatePath, "node_modules");

      if (fs.existsSync(nodeModulesPath)) {
        console.log("[TemplateCache] Cache already exists, skipping init");
        cacheReady = true;
        return;
      }

      console.log("[TemplateCache] Creating pre-warmed Expo template...");

      fs.mkdirSync(templatePath, { recursive: true });

      for (const [filePath, content] of Object.entries(BOILERPLATE_FILES)) {
        const fullPath = path.join(templatePath, filePath);
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, content, "utf-8");
      }

      writeScaffoldUiFiles(templatePath);
      writeRuntimeSafetyFiles(templatePath);

      console.log("[TemplateCache] Running npm install (this may take a minute)...");
      await npmInstall(templatePath);

      cacheReady = true;
      console.log("[TemplateCache] Template cache ready");
    } catch (error) {
      cacheInitPromise = null;
      throw error;
    }
  })();

  return cacheInitPromise;
};

export const createProjectFromCache = async (
  projectName: string,
  appDisplayName: string,
  extraDependencies?: string[]
): Promise<string> => {
  if (!cacheReady) {
    await initTemplateCache();
  }

  const templatePath = getTemplatePath();
  const projectPath = getProjectPath(projectName);

  // Clean slate: remove any existing project directory to prevent contamination
  if (fs.existsSync(projectPath)) {
    console.log(`[TemplateCache] Cleaning existing project: ${projectName}`);
    fs.rmSync(projectPath, { recursive: true, force: true });
  }

  console.log(`[TemplateCache] Cloning template -> ${projectName} (hard-linked deps)...`);
  cloneTemplateInto(templatePath, projectPath);

  // Always (re)write the scaffold surfaces so projects copied from an older warm
  // cache still receive the safe <Icon> wrapper, the "@/ui" barrel, and the
  // "@/services/db" data layer.
  writeScaffoldUiFiles(projectPath);
  // Same reason: refresh the web-preview safety net (metro alias + native stub) so
  // even projects from a stale warm cache get the crash-proof web bundle.
  writeRuntimeSafetyFiles(projectPath);

  const appJson = JSON.parse(
    fs.readFileSync(path.join(projectPath, "app.json"), "utf-8")
  );
  appJson.expo.name = appDisplayName;
  appJson.expo.slug = projectName;
  fs.writeFileSync(
    path.join(projectPath, "app.json"),
    JSON.stringify(appJson, null, 2),
    "utf-8"
  );

  if (extraDependencies?.length) {
    const { valid, rejected } = await validateDependencies(extraDependencies);
    if (rejected.length > 0) {
      console.warn(`[TemplateCache] Rejected dependencies (not found on npm): ${rejected.join(", ")}`);
    }
    if (valid.length > 0) {
      console.log(`[TemplateCache] Installing extra deps: ${valid.join(", ")}...`);
      try {
        await npmInstall(projectPath, valid);
      } catch (err) {
        // Fallback: install one by one, skip failures
        console.warn(`[TemplateCache] Batch install failed, trying individually...`);
        for (const dep of valid) {
          try {
            await npmInstall(projectPath, [dep]);
          } catch {
            console.warn(`[TemplateCache] Failed to install ${dep}, skipping`);
          }
        }
      }
    }
  }

  return projectPath;
};

export const isCacheReady = (): boolean => cacheReady;

