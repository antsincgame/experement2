import { describe, expect, it } from "vitest";
import {
  selectGoldenExample,
  buildGoldenExampleBlock,
  LIST_SCREEN_EXAMPLE,
  STORE_EXAMPLE,
  COMPONENT_EXAMPLE,
  FORM_SCREEN_EXAMPLE,
} from "./golden-examples.js";

const ALL_EXAMPLES: Record<string, string> = {
  LIST_SCREEN_EXAMPLE,
  STORE_EXAMPLE,
  COMPONENT_EXAMPLE,
  FORM_SCREEN_EXAMPLE,
};

describe("selectGoldenExample", () => {
  it("picks the LIST screen for a list/feed screen", () => {
    const result = selectGoldenExample({
      type: "screen",
      description: "A feed listing all saved notes with persistence",
    });
    expect(result).toBe(LIST_SCREEN_EXAMPLE);
  });

  it("picks the FORM screen for a create/form screen (keyword beats list)", () => {
    const result = selectGoldenExample({
      type: "screen",
      description: "A form to create a new item with a title input",
    });
    expect(result).toBe(FORM_SCREEN_EXAMPLE);
  });

  it("picks the FORM screen for an edit screen", () => {
    const result = selectGoldenExample({
      type: "screen",
      description: "Screen to edit an existing record and submit changes",
    });
    expect(result).toBe(FORM_SCREEN_EXAMPLE);
  });

  it("falls back to the LIST screen for a generic screen with no keyword", () => {
    const result = selectGoldenExample({
      type: "screen",
      description: "The main dashboard surface",
    });
    expect(result).toBe(LIST_SCREEN_EXAMPLE);
  });

  it("picks the STORE exemplar for a store", () => {
    const result = selectGoldenExample({
      type: "store",
      description: "Zustand store holding the app's data",
    });
    expect(result).toBe(STORE_EXAMPLE);
  });

  it("picks the COMPONENT exemplar for a component", () => {
    const result = selectGoldenExample({
      type: "component",
      description: "A reusable card row",
    });
    expect(result).toBe(COMPONENT_EXAMPLE);
  });

  it("is case-insensitive on the file type", () => {
    expect(selectGoldenExample({ type: "SCREEN", description: "items list" })).toBe(
      LIST_SCREEN_EXAMPLE
    );
    expect(selectGoldenExample({ type: "Store", description: "global state" })).toBe(
      STORE_EXAMPLE
    );
  });

  it("returns null for types with no exemplar (hook/type/layout)", () => {
    expect(selectGoldenExample({ type: "hook", description: "useTimer hook" })).toBeNull();
    expect(selectGoldenExample({ type: "type", description: "type definitions" })).toBeNull();
    expect(selectGoldenExample({ type: "layout", description: "tab layout" })).toBeNull();
    expect(selectGoldenExample({ type: "", description: "" })).toBeNull();
  });

  it("returns TOP-1: a single string, never a list", () => {
    const result = selectGoldenExample({
      type: "screen",
      description: "a list feed of records to browse and a form to create",
    });
    expect(typeof result).toBe("string");
    expect(Array.isArray(result)).toBe(false);
  });
});

describe("buildGoldenExampleBlock", () => {
  it("returns a clearly-labelled block containing the exemplar on a match", () => {
    const block = buildGoldenExampleBlock({
      type: "store",
      description: "data store",
    });
    expect(block).toContain("## WORKING EXAMPLE");
    expect(block).toContain(STORE_EXAMPLE);
  });

  it("returns an empty string on no match (so injection is additive)", () => {
    expect(buildGoldenExampleBlock({ type: "hook", description: "useFoo" })).toBe("");
  });

  it("injects AT MOST ONE exemplar (exactly one WORKING EXAMPLE header)", () => {
    const block = buildGoldenExampleBlock({
      type: "screen",
      description: "a list and a form on one screen",
    });
    const headerCount = block.split("## WORKING EXAMPLE").length - 1;
    expect(headerCount).toBe(1);
  });
});

// Quality guard: these strings are TEACHING MATERIAL. If an exemplar regresses into
// a forbidden pattern, it would teach the model wrong — so fail loudly here.
describe("exemplar quality guard", () => {
  const FORBIDDEN: { label: string; pattern: RegExp }[] = [
    // View/Text imported from react-native (Pressable from react-native is allowed).
    {
      label: "View/Text imported from react-native",
      pattern: /import\s*\{[^}]*\b(View|Text)\b[^}]*\}\s*from\s*["']react-native["']/,
    },
    { label: "StyleSheet.create", pattern: /StyleSheet\.create/ },
    {
      label: "import from @expo/vector-icons",
      pattern: /from\s*["']@expo\/vector-icons/,
    },
    { label: "double-src @/src/ path", pattern: /@\/src\// },
    // Tamagui has no theme prop / no compound Card / no bordered boolean.
    { label: "tamagui theme prop", pattern: /\btheme=/ },
    { label: "Card compound subcomponents", pattern: /<Card\.(Header|Body|Footer)/ },
    { label: "Pressable imported from tamagui", pattern: /import\s*\{[^}]*Pressable[^}]*\}\s*from\s*["']tamagui["']/ },
  ];

  // UI-bearing exemplars must import their UI from "@/ui"; the store has no UI and
  // instead persists through the blessed "@/services/db" data layer.
  const UI_EXAMPLES = new Set(["LIST_SCREEN_EXAMPLE", "COMPONENT_EXAMPLE", "FORM_SCREEN_EXAMPLE"]);

  for (const [name, code] of Object.entries(ALL_EXAMPLES)) {
    describe(name, () => {
      it("ends with // EOF", () => {
        expect(code.trimEnd().endsWith("// EOF")).toBe(true);
      });

      if (UI_EXAMPLES.has(name)) {
        it("imports UI from @/ui", () => {
          expect(code).toMatch(/from\s*["']@\/ui["']/);
        });
      } else {
        it("persists through @/services/db", () => {
          expect(code).toMatch(/from\s*["']@\/services\/db["']/);
        });
      }

      for (const rule of FORBIDDEN) {
        it(`does NOT contain: ${rule.label}`, () => {
          expect(rule.pattern.test(code)).toBe(false);
        });
      }
    });
  }
});
// EOF
