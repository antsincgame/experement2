// Covers the schema-level contract so unsupported navigation shapes are rejected before generation.
import { describe, it, expect } from "vitest";
import { AppPlanSchema, FileInPlanSchema } from "./app-plan.schema";

const validFile = {
  path: "src/App.tsx",
  type: "component",
  description: "Root application component",
};

const minimalPlan = {
  name: "my-app",
  displayName: "My App",
  description: "A test application",
  files: [validFile],
};

describe("FileInPlanSchema", () => {
  it("validates a file with all fields", () => {
    const result = FileInPlanSchema.parse({
      path: "src/utils/helpers.ts",
      type: "utility",
      description: "Helper functions",
      dependencies: ["src/types/index.ts"],
    });
    expect(result.dependencies).toEqual(["src/types/index.ts"]);
  });

  it("defaults dependencies to empty array", () => {
    const result = FileInPlanSchema.parse(validFile);
    expect(result.dependencies).toEqual([]);
  });

  it("rejects empty path", () => {
    expect(() =>
      FileInPlanSchema.parse({ ...validFile, path: "" })
    ).toThrow();
  });
});

describe("AppPlanSchema", () => {
  it("parses a valid full plan with all fields", () => {
    const result = AppPlanSchema.parse({
      ...minimalPlan,
      extraDependencies: ["react-native-reanimated"],
      navigation: {
        type: "tabs",
        screens: [{ path: "screens/Home.tsx", name: "Home", icon: "home" }],
      },
    });
    expect(result.name).toBe("my-app");
    expect(result.extraDependencies).toEqual(["react-native-reanimated"]);
    expect(result.navigation?.type).toBe("tabs");
    expect(result.navigation?.screens).toHaveLength(1);
  });

  it("parses a minimal plan with required fields only", () => {
    const result = AppPlanSchema.parse(minimalPlan);
    expect(result.name).toBe("my-app");
    expect(result.extraDependencies).toEqual([]);
    expect(result.navigation).toBeUndefined();
  });

  it("auto-sanitizes name: spaces to dashes, uppercase to lower", () => {
    const result = AppPlanSchema.parse({
      ...minimalPlan,
      name: "My Cool App",
    });
    expect(result.name).toBe("my-cool-app");
  });

  it("auto-sanitizes name: removes special characters", () => {
    const result = AppPlanSchema.parse({
      ...minimalPlan,
      name: "app@#$name!",
    });
    expect(result.name).toBe("app-name-");
  });

  it("collapses consecutive dashes in name", () => {
    const result = AppPlanSchema.parse({
      ...minimalPlan,
      name: "my   app",
    });
    expect(result.name).toBe("my-app");
  });

  it("rejects empty name", () => {
    expect(() =>
      AppPlanSchema.parse({ ...minimalPlan, name: "" })
    ).toThrow();
  });

  it("rejects plan with empty files array", () => {
    expect(() =>
      AppPlanSchema.parse({ ...minimalPlan, files: [] })
    ).toThrow();
  });

  it("accepts extraDependencies list", () => {
    const result = AppPlanSchema.parse({
      ...minimalPlan,
      extraDependencies: ["expo-router", "nativewind"],
    });
    expect(result.extraDependencies).toEqual(["expo-router", "nativewind"]);
  });

  it("accepts navigation with tabs type", () => {
    const result = AppPlanSchema.parse({
      ...minimalPlan,
      navigation: {
        type: "tabs",
        screens: [{ path: "screens/Home.tsx", name: "Home" }],
      },
    });
    expect(result.navigation?.type).toBe("tabs");
  });

  it("rejects navigation with unsupported drawer type", () => {
    expect(() =>
      AppPlanSchema.parse({
        ...minimalPlan,
        navigation: { type: "drawer", screens: [] },
      })
    ).toThrow();
  });

  it("defaults navigation type to stack", () => {
    const result = AppPlanSchema.parse({
      ...minimalPlan,
      navigation: { screens: [] },
    });
    expect(result.navigation?.type).toBe("stack");
  });

  it("rejects invalid navigation type", () => {
    expect(() =>
      AppPlanSchema.parse({
        ...minimalPlan,
        navigation: { type: "modal", screens: [] },
      })
    ).toThrow();
  });

  it("rejects navigation screens without path", () => {
    expect(() =>
      AppPlanSchema.parse({
        ...minimalPlan,
        navigation: {
          type: "tabs",
          screens: [{ name: "Home" }],
        },
      })
    ).toThrow();
  });

  it("accepts file type as any non-empty string", () => {
    const result = AppPlanSchema.parse({
      ...minimalPlan,
      files: [{ ...validFile, type: "custom-whatever-type" }],
    });
    expect(result.files[0].type).toBe("custom-whatever-type");
  });

  it("handles very long name by sanitizing it", () => {
    const longName = "a".repeat(300);
    const result = AppPlanSchema.parse({ ...minimalPlan, name: longName });
    expect(result.name).toBe(longName);
    expect(result.name.length).toBe(300);
  });
});
