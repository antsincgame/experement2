// Tests contract-aware validation for plans and generated projects before they reach build gates.
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import type { AppPlan } from "../schemas/app-plan.schema.js";
import {
  autoHealImportContracts,
  validateAppPlan,
  validateFileContracts,
  validateGeneratedProject,
} from "./project-validator.js";
import { extractExportContracts, type ExportContract } from "./context-builder.js";

const makeContract = (over: Partial<ExportContract> & { name: string }): ExportContract => ({
  isDefaultExport: false,
  kind: "function",
  params: [],
  returnType: "",
  returnObjectKeys: [],
  propsInterface: null,
  ...over,
});

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

  it("accepts extensionless and alias dependencies that resolve to planned files", () => {
    const plan: AppPlan = {
      name: "demo-app",
      displayName: "Demo App",
      description: "Demo",
      extraDependencies: [],
      files: [
        {
          path: "app/index.tsx",
          type: "screen",
          description: "Home",
          // Extensionless src dep + alias dep — the natural form models emit.
          dependencies: ["src/stores/itemStore", "@/components/ItemCard"],
        },
        { path: "src/stores/itemStore.ts", type: "store", description: "Store", dependencies: [] },
        { path: "src/components/ItemCard.tsx", type: "component", description: "Card", dependencies: [] },
      ],
      navigation: { type: "stack", screens: [] },
    };

    const issues = validateAppPlan(plan);
    expect(issues.filter((issue) => issue.code === "missing_dependency_file")).toEqual([]);
    expect(issues.filter((issue) => issue.code === "invalid_dependency_reference")).toEqual([]);
  });

  it("now catches a genuinely missing alias dependency (previously skipped)", () => {
    const plan: AppPlan = {
      name: "demo-app",
      displayName: "Demo App",
      description: "Demo",
      extraDependencies: [],
      files: [
        {
          path: "app/index.tsx",
          type: "screen",
          description: "Home",
          dependencies: ["@/stores/missingStore"],
        },
      ],
      navigation: { type: "stack", screens: [] },
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

  it("does not treat string literals in JSX as import specifiers", () => {
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
        'import { Text } from "react-native";',
        "",
        "export default function Home() {",
        '  return <Text>Built from "scratch"</Text>;',
        "}",
        "",
      ].join("\n")
    );

    const issues = validateGeneratedProject(projectPath, "tabs");

    expect(issues).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "missing_package_dependency" }),
      ])
    );
  });
});

describe("autoHealImportContracts — path-scoped", () => {
  it("does NOT rewrite a correct local default import that shares a name with another module's named export", () => {
    // The @/ui barrel exports `Button` as NAMED; a local component default-exports `Button`.
    // The old name-only heal rewrote the correct local default import into a broken named one.
    const contracts: Record<string, ExportContract[]> = {
      "src/components/Button.tsx": [makeContract({ name: "Button", isDefaultExport: true, kind: "component" })],
      "src/lib/ui-helpers.ts": [makeContract({ name: "Button", isDefaultExport: false })],
    };
    const content = `import Button from "@/components/Button";\n`;
    expect(autoHealImportContracts(content, contracts, "app/(tabs)/index.tsx")).toBe(content);
  });

  it("does NOT touch imports from a scaffold barrel that is not in the contracts map (@/ui)", () => {
    const contracts: Record<string, ExportContract[]> = {
      "src/components/Button.tsx": [makeContract({ name: "Button", isDefaultExport: true, kind: "component" })],
    };
    const content = `import { Button, YStack } from "@/ui";\n`;
    expect(autoHealImportContracts(content, contracts, "app/(tabs)/index.tsx")).toBe(content);
  });

  it("still heals a genuinely wrong shape from the OWNING module (named→default)", () => {
    const contracts: Record<string, ExportContract[]> = {
      "src/components/Button.tsx": [makeContract({ name: "Button", isDefaultExport: true, kind: "component" })],
    };
    const content = `import { Button } from "@/components/Button";\n`;
    expect(autoHealImportContracts(content, contracts, "app/(tabs)/index.tsx")).toBe(
      `import Button from "@/components/Button";\n`,
    );
  });

  it("still heals a default import of a named export from the owning module (default→named)", () => {
    const contracts: Record<string, ExportContract[]> = {
      "src/lib/format.ts": [makeContract({ name: "formatDate", isDefaultExport: false })],
    };
    const content = `import formatDate from "@/lib/format";\n`;
    expect(autoHealImportContracts(content, contracts, "app/x.tsx")).toBe(
      `import { formatDate } from "@/lib/format";\n`,
    );
  });

  it("leaves type-only imports alone", () => {
    const contracts: Record<string, ExportContract[]> = {
      "src/types/index.ts": [makeContract({ name: "Item", isDefaultExport: true, kind: "interface" })],
    };
    const content = `import type { Item } from "@/types/index";\n`;
    expect(autoHealImportContracts(content, contracts, "app/x.tsx")).toBe(content);
  });
});

describe("validateFileContracts — path-scoped import shapes", () => {
  it("does NOT flag a correct default import that collides by name with another module's named export", () => {
    const contracts: Record<string, ExportContract[]> = {
      "src/components/Card.tsx": [makeContract({ name: "Card", isDefaultExport: true, kind: "component" })],
      "src/lib/other.ts": [makeContract({ name: "Card", isDefaultExport: false })],
    };
    const content = `import Card from "@/components/Card";\n`;
    expect(validateFileContracts(content, "app/index.tsx", contracts)).toHaveLength(0);
  });

  it("flags a named import the OWNING module exports as default", () => {
    const contracts: Record<string, ExportContract[]> = {
      "src/components/Card.tsx": [makeContract({ name: "Card", isDefaultExport: true, kind: "component" })],
    };
    const content = `import { Card } from "@/components/Card";\n`;
    const violations = validateFileContracts(content, "app/index.tsx", contracts);
    expect(violations).toHaveLength(1);
    expect(violations[0].code).toBe("default_import_mismatch");
  });

  it("does not flag imports from modules with no generated contract (scaffold/node_modules)", () => {
    const contracts: Record<string, ExportContract[]> = {
      "src/components/Card.tsx": [makeContract({ name: "Card", isDefaultExport: true, kind: "component" })],
    };
    const content = `import { Card } from "@/ui";\nimport { useState } from "react";\n`;
    expect(validateFileContracts(content, "app/index.tsx", contracts)).toHaveLength(0);
  });
});

describe("extractExportContracts — split store union", () => {
  it("unions State & Actions interface keys for a Zustand store", () => {
    const projectPath = createTempProject();
    writeProjectFile(
      projectPath,
      "src/stores/counterStore.ts",
      [
        'import { create } from "zustand";',
        "interface CounterState { count: number; loading: boolean; }",
        "interface CounterActions { increment: () => void; reset: () => void; }",
        "export const useCounterStore = create<CounterState & CounterActions>((set) => ({",
        "  count: 0,",
        "  loading: false,",
        "  increment: () => set((s) => ({ count: s.count + 1 })),",
        "  reset: () => set({ count: 0 }),",
        "}));",
        "",
      ].join("\n"),
    );

    const contracts = extractExportContracts(path.join(projectPath, "src/stores/counterStore.ts"));
    const store = contracts?.find((c) => c.name === "useCounterStore");
    expect(store?.returnObjectKeys).toEqual(
      expect.arrayContaining(["count", "loading", "increment", "reset"]),
    );
  });
});

describe("validateFileContracts — path-scoped destructure keys (M4)", () => {
  it("does NOT validate a hook imported from a non-generated module (e.g. react-native)", () => {
    // A store named useWindow exists, but the screen destructures a DIFFERENT useWindow
    // imported from react-native — must not be flagged against the store's keys.
    const contracts: Record<string, ExportContract[]> = {
      "src/stores/useWindow.ts": [makeContract({ name: "useWindow", kind: "hook", returnObjectKeys: ["a", "b"] })],
    };
    const content = `import { useWindow } from "react-native";\nconst { width, height } = useWindow();\n`;
    expect(validateFileContracts(content, "app/x.tsx", contracts)).toHaveLength(0);
  });

  it("validates against the OWNING store only when name collides across modules", () => {
    const contracts: Record<string, ExportContract[]> = {
      "src/stores/a.ts": [makeContract({ name: "useThing", kind: "hook", returnObjectKeys: ["x"] })],
      "src/stores/b.ts": [makeContract({ name: "useThing", kind: "hook", returnObjectKeys: ["y"] })],
    };
    const content = `import { useThing } from "@/stores/b";\nconst { y } = useThing();\n`;
    // imported from b → validate against [y]; old name-only code could pick a's [x] and flag y.
    expect(validateFileContracts(content, "app/x.tsx", contracts)).toHaveLength(0);
  });

  it("still flags a genuinely invalid key on the correctly-resolved store", () => {
    const contracts: Record<string, ExportContract[]> = {
      "src/stores/counter.ts": [makeContract({ name: "useCounter", kind: "hook", returnObjectKeys: ["count", "increment"] })],
    };
    const content = `import { useCounter } from "@/stores/counter";\nconst { count, bogus } = useCounter();\n`;
    const violations = validateFileContracts(content, "app/x.tsx", contracts);
    expect(violations.some((v) => v.code === "invalid_destructured_key" && v.message.includes("bogus"))).toBe(true);
  });
});
