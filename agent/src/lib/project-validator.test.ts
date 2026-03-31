// Tests contract-aware validation for plans and generated projects before they reach build gates.
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import type { AppPlan } from "../schemas/app-plan.schema.js";
import {
  validateAppPlan,
  validateGeneratedProject,
} from "./project-validator.js";

const tempDirs: string[] = [];

const createTempProject = (): string => {
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), "app-factory-"));
  tempDirs.push(projectPath);
  return projectPath;
};

const writeProjectFile = (
  projectPath: string,
  relativePath: string,
  content: string
): void => {
  const fullPath = path.join(projectPath, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, "utf-8");
};

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

describe("validateAppPlan", () => {
  it("rejects dependencies that are missing from files", () => {
    const plan: AppPlan = {
      name: "demo-app",
      displayName: "Demo App",
      description: "Demo",
      extraDependencies: [],
      files: [
        {
          path: "app/(tabs)/index.tsx",
          type: "screen",
          description: "Home",
          dependencies: ["src/hooks/useCounter.ts"],
        },
      ],
      navigation: {
        type: "tabs",
        screens: [{ path: "app/(tabs)/index.tsx", name: "Home", icon: "home-outline" }],
      },
    };

    expect(validateAppPlan(plan)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "missing_dependency_file" }),
      ])
    );
  });

  it("rejects tabs screens outside app/(tabs)", () => {
    const plan: AppPlan = {
      name: "demo-app",
      displayName: "Demo App",
      description: "Demo",
      extraDependencies: [],
      files: [
        {
          path: "app/profile.tsx",
          type: "screen",
          description: "Profile",
          dependencies: [],
        },
      ],
      navigation: {
        type: "tabs",
        screens: [{ path: "app/profile.tsx", name: "Profile", icon: "person-outline" }],
      },
    };

    expect(validateAppPlan(plan)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "invalid_tab_screen_path" }),
      ])
    );
  });
});

describe("validateGeneratedProject", () => {
  it("flags invalid alias and missing local imports", () => {
    const projectPath = createTempProject();

    writeProjectFile(
      projectPath,
      "package.json",
      JSON.stringify(
        {
          dependencies: {
            expo: "~55.0.9",
            "expo-router": "~55.0.8",
            react: "19.2.0",
            "react-native": "0.83.4",
            "@expo/vector-icons": "^15.0.2",
          },
          devDependencies: {
            typescript: "~5.9.2",
          },
        },
        null,
        2
      )
    );

    writeProjectFile(projectPath, "app/_layout.tsx", "export default function RootLayout() { return null; }\n");
    writeProjectFile(projectPath, "app/(tabs)/_layout.tsx", "export default function TabsLayout() { return null; }\n");
    writeProjectFile(projectPath, "app.json", "{}\n");
    writeProjectFile(projectPath, "tsconfig.json", "{}\n");
    writeProjectFile(projectPath, "babel.config.js", "module.exports = {};\n");
    writeProjectFile(projectPath, "metro.config.js", "module.exports = {};\n");
    writeProjectFile(projectPath, "tailwind.config.js", "module.exports = {};\n");
    writeProjectFile(projectPath, "nativewind-env.d.ts", "/// <reference types=\"nativewind/types\" />\n");
    writeProjectFile(projectPath, "expo-env.d.ts", "/// <reference types=\"expo/types\" />\n");
    writeProjectFile(projectPath, "src/global.css", "@tailwind base;\n");
    writeProjectFile(projectPath, ".gitignore", "node_modules/\n");
    writeProjectFile(
      projectPath,
      "app/(tabs)/index.tsx",
      [
        'import Ionicons from "@expo/vector-icons";',
        'import Missing from "@/src/components/Missing";',
        'import Helper from "@/components/Helper";',
        "",
        "export default function Home() {",
        "  return null;",
        "}",
        "",
      ].join("\n")
    );

    const issues = validateGeneratedProject(projectPath, "tabs");

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "base_vector_icons_import" }),
        expect.objectContaining({ code: "double_src_alias" }),
        expect.objectContaining({ code: "missing_local_import" }),
      ])
    );
  });
});
