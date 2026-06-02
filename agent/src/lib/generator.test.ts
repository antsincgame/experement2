// Characterization tests: lock the current behavior of the generator's
// LLM-output post-processing so this fragile, regex-heavy logic can be changed
// safely. These assert what the code does today, not an idealized spec.
import { describe, it, expect } from "vitest";
import {
  sanitizeGeneratedCode,
  extractCodeFromResponse,
  ensureDefaultExport,
  fixHookImports,
  fixComponentImports,
  normalizeImportDeclarations,
  stripCodePreamble,
  buildPlanContext,
  extractReasoning,
} from "./generator.js";
import type { AppPlan } from "../schemas/app-plan.schema.js";

describe("buildPlanContext", () => {
  const plan = {
    name: "notes",
    displayName: "Notes",
    description: "A notes app",
    extraDependencies: [],
    theme: { style: "premium" },
    navigation: { type: "tabs", screens: [] },
    files: [
      { path: "app/(tabs)/index.tsx", type: "screen", description: "List screen", dependencies: ["src/stores/noteStore.ts"] },
      { path: "src/stores/noteStore.ts", type: "store", description: "Zustand store with CRUD", dependencies: ["src/types/index.ts"] },
      { path: "src/types/index.ts", type: "type", description: "Domain types", dependencies: [] },
    ],
  } as unknown as AppPlan;

  it("includes the app header and a full file manifest", () => {
    const ctx = buildPlanContext(plan, plan.files[0]);
    expect(ctx).toContain("Name: Notes (notes)");
    expect(ctx).toContain("Theme: premium; Navigation: tabs");
    expect(ctx).toContain("- app/(tabs)/index.tsx (screen)");
    expect(ctx).toContain("- src/types/index.ts (type)");
  });

  it("lists only the target file's direct dependency intent, not all descriptions", () => {
    const ctx = buildPlanContext(plan, plan.files[0]);
    expect(ctx).toContain("- src/stores/noteStore.ts (store): Zustand store with CRUD");
    // The unrelated types file's description is NOT inlined as a dependency intent.
    expect(ctx).not.toContain("(type): Domain types");
  });

  it("omits the dependency section when the file has no dependencies", () => {
    const ctx = buildPlanContext(plan, plan.files[2]);
    expect(ctx).not.toContain("This file's dependencies");
  });
});

describe("extractReasoning", () => {
  it("extracts a closed <think> block", () => {
    expect(extractReasoning("<think>plan it</think>code")).toBe("plan it");
  });

  it("extracts an unclosed reasoning block", () => {
    expect(extractReasoning("<thinking>still going")).toBe("still going");
  });

  it("returns empty string when there is no reasoning", () => {
    expect(extractReasoning("just code")).toBe("");
  });
});

describe("sanitizeGeneratedCode", () => {
  it("strips closed <think> blocks", () => {
    const out = sanitizeGeneratedCode("<think>reasoning</think>export const x = 1;");
    expect(out).not.toContain("<think>");
    expect(out).toContain("export const x = 1;");
  });

  it("strips an unclosed <think> block to end of file", () => {
    const out = sanitizeGeneratedCode("export const x = 1;\n<think>oops never closed");
    expect(out).not.toContain("<think>");
  });

  it("rewrites the @/src/ double-alias and expo-router/tabs specifiers", () => {
    expect(sanitizeGeneratedCode(`import { A } from "@/src/lib/a";`)).toContain(`from "@/lib/a"`);
    expect(sanitizeGeneratedCode(`import { Tabs } from "expo-router/tabs";`)).toContain(`from "expo-router"`);
  });

  it("hoists React.useX to a named react import when React is not imported", () => {
    const out = sanitizeGeneratedCode("const C = () => { const [n] = React.useState(0); return n; };");
    expect(out).toContain(`from "react"`);
    expect(out).toContain("useState");
    expect(out).not.toContain("React.useState");
  });
});

describe("ensureDefaultExport", () => {
  it("upgrades a named hook export to default", () => {
    const out = ensureDefaultExport("export function useCounter() { return 1; }", "src/hooks/useCounter.ts");
    expect(out).toContain("export default function useCounter");
  });

  it("leaves files that already have a default export untouched", () => {
    const code = "export default function Screen() { return null; }";
    expect(ensureDefaultExport(code, "app/index.tsx")).toBe(code);
  });

  it("leaves non-hook/component/screen files untouched", () => {
    const code = "export function helper() { return 1; }";
    expect(ensureDefaultExport(code, "src/lib/util.ts")).toBe(code);
  });
});

describe("fixHookImports / fixComponentImports", () => {
  it("converts named hook imports to default imports", () => {
    expect(fixHookImports(`import { useCounter } from "@/hooks/useCounter";`))
      .toBe(`import useCounter from "@/hooks/useCounter";`);
  });

  it("converts named component imports to default imports", () => {
    expect(fixComponentImports(`import { Card } from "@/components/Card";`))
      .toBe(`import Card from "@/components/Card";`);
  });

  it("leaves unrelated imports alone", () => {
    const code = `import { useState } from "react";`;
    expect(fixHookImports(code)).toBe(code);
  });
});

describe("normalizeImportDeclarations", () => {
  it("collapses the @/src/ alias", () => {
    expect(normalizeImportDeclarations(`import Button from "@/src/components/Button";`))
      .toContain(`from "@/components/Button"`);
  });

  it("rewrites a base @expo/vector-icons import to the Feather subpath", () => {
    const out = normalizeImportDeclarations(`import { Feather } from "@expo/vector-icons";`);
    expect(out).toContain(`from "@expo/vector-icons/Feather"`);
    expect(out).toContain("import Feather");
  });

  it("routes a known icon family to its own subpath", () => {
    const out = normalizeImportDeclarations(`import { Ionicons } from "@expo/vector-icons";`);
    expect(out).toContain(`from "@expo/vector-icons/Ionicons"`);
  });

  it("returns the input unchanged when it cannot be parsed", () => {
    const broken = "this is not valid <<< typescript";
    expect(normalizeImportDeclarations(broken)).toBe(broken);
  });
});

describe("extractCodeFromResponse", () => {
  it("parses a filepath header and returns the code body", () => {
    const result = extractCodeFromResponse("filepath: src/x.ts\nexport const x = 1;");
    expect(result).not.toBeNull();
    expect(result?.filepath).toBe("src/x.ts");
    expect(result?.code).toContain("export const x = 1;");
  });

  it("strips markdown fences around the code body", () => {
    const result = extractCodeFromResponse(
      "filepath: app/x.tsx\n```tsx\nexport default function X() { return null; }\n```"
    );
    expect(result?.code).toContain("export default function X");
    expect(result?.code).not.toContain("```");
  });

  it("returns null when there is no filepath header", () => {
    expect(extractCodeFromResponse("just some prose, no header")).toBeNull();
  });
});

describe("stripCodePreamble", () => {
  it("drops prose before the first import/export", () => {
    const out = stripCodePreamble("Here is the fix:\n\nimport X from 'y';\nexport const z = 1;");
    expect(out.startsWith("import X")).toBe(true);
  });

  it("strips surrounding code fences", () => {
    expect(stripCodePreamble("```ts\nimport a from 'b';\n```")).toBe("import a from 'b';");
  });
});
