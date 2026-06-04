// Ensures pipeline model role resolution stays aligned with settings labels.
import { describe, expect, it } from "vitest";
import {
  formatModelRoleLabel,
  resolveFixModel,
  resolveGenerationModel,
  resolvePlannerModel,
} from "./model-roles.js";

describe("model-roles", () => {
  it("resolvePlannerModel prefers planner over generation", () => {
    expect(resolvePlannerModel("planner-a", "gen-b")).toBe("planner-a");
    expect(resolvePlannerModel("", "gen-b")).toBe("gen-b");
    expect(resolvePlannerModel(undefined, undefined)).toBeUndefined();
  });

  it("resolveGenerationModel trims and ignores empty", () => {
    expect(resolveGenerationModel("  qwen  ")).toBe("qwen");
    expect(resolveGenerationModel("   ")).toBeUndefined();
  });

  it("resolveFixModel prefers editor over generation", () => {
    expect(resolveFixModel("editor-x", "gen-y")).toBe("editor-x");
    expect(resolveFixModel("", "gen-y")).toBe("gen-y");
  });

  it("formatModelRoleLabel includes role prefix and Auto fallback", () => {
    expect(formatModelRoleLabel("fix", undefined)).toContain("Editor/Fix");
    expect(formatModelRoleLabel("fix", undefined)).toContain("Auto");
    expect(formatModelRoleLabel("generation", "qwen")).toContain("qwen");
  });
});
