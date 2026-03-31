import fs from "fs";
import path from "path";
import { getWorkspaceRoot, copyDirectory } from "./file-manager.js";
import { npmInstall } from "./process-manager.js";

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
      scripts: {
        start: "expo start",
        web: "expo start --web",
      },
      dependencies: {
        expo: "~55.0.9",
        "expo-router": "~55.0.8",
        "expo-status-bar": "~55.0.4",
        "expo-linking": "~55.0.9",
        "expo-constants": "~55.0.9",
        react: "19.2.0",
        "react-dom": "19.2.0",
        "react-native": "0.83.4",
        "react-native-web": "~0.21.0",
        "react-native-safe-area-context": "~5.6.2",
        "react-native-screens": "~4.23.0",
        "react-native-gesture-handler": "~2.30.0",
        "react-native-reanimated": "4.2.1",
        nativewind: "^4.0.0",
        "tailwindcss": "^3.4.0",
      },
      devDependencies: {
        "@types/react": "~19.2.2",
        typescript: "~5.9.2",
      },
    },
    null,
    2
  ),

  "tsconfig.json": JSON.stringify(
    {
      extends: "expo/tsconfig.base",
      compilerOptions: {
        strict: true,
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
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
    plugins: ["react-native-reanimated/plugin"],
  };
};
`,

  "metro.config.js": `const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

module.exports = withNativeWind(config, { input: "./src/global.css" });
`,

  "tailwind.config.js": `/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}", "./app/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: { extend: {} },
  plugins: [],
};
`,

  "nativewind-env.d.ts": `/// <reference types="nativewind/types" />
`,

  "src/global.css": `@tailwind base;
@tailwind components;
@tailwind utilities;
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
    console.log("[TemplateCache] ✅ Template cache ready!");
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
  const projectPath = path.join(getWorkspaceRoot(), projectName);

  if (fs.existsSync(projectPath)) {
    throw new Error(`Project "${projectName}" already exists`);
  }

  console.log(`[TemplateCache] Copying template → ${projectName}...`);
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
    console.log(
      `[TemplateCache] Installing extra deps: ${extraDependencies.join(", ")}...`
    );
    await npmInstall(projectPath, extraDependencies);
  }

  return projectPath;
};

export const isCacheReady = (): boolean => cacheReady;
