// Builds generated Expo templates from the shared contract so runtime scaffolding stays version-locked with prompts.
import fs from "fs";
import path from "path";
import { getWorkspaceRoot, copyDirectory, getProjectPath } from "./file-manager.js";
import { npmInstall } from "./process-manager.js";
import {
  TEMPLATE_PACKAGE_DEPENDENCIES,
  TEMPLATE_PACKAGE_DEV_DEPENDENCIES,
  TEMPLATE_PACKAGE_SCRIPTS,
} from "../lib/generation-contract.js";
import { validateDependencies } from "../lib/dependency-validator.js";

const TEMPLATE_DIR_NAME = "template_cache";

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
    plugins: ["react-native-reanimated/plugin"],
  };
};
`,

  "metro.config.js": `const { getDefaultConfig } = require("expo/metro-config");
module.exports = getDefaultConfig(__dirname);
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

    console.log("[TemplateCache] Running npm install (this may take a minute)...");
    await npmInstall(templatePath);

    cacheReady = true;
    console.log("[TemplateCache] Template cache ready");
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

  console.log(`[TemplateCache] Copying template -> ${projectName}...`);
  copyDirectory(templatePath, projectPath);

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

