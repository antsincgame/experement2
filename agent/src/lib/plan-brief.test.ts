// Guards against eager cross-package export snapshots (undefined under tsx, green under vitest).
import { describe, expect, it } from "vitest";
import { formatPlanBriefForModels } from "./plan-brief.js";

describe("plan-brief shim (call-time bindings)", () => {
  it("formatPlanBriefForModels is callable after shim import only", () => {
    expect(typeof formatPlanBriefForModels).toBe("function");
    const text = formatPlanBriefForModels({
      displayName: "ShimTest",
      description: "Smoke app for tsx load order.",
      files: [{ path: "app/index.tsx", type: "screen", description: "Home screen." }],
    });
    expect(text).toContain("# ShimTest");
    expect(text.length).toBeGreaterThan(50);
  });

  it("stays callable when plan-artifact loads before shim consumers", async () => {
    await import("./plan-artifact.js");
    const { formatPlanBriefForModels: fn } = await import("./plan-brief.js");
    expect(typeof fn).toBe("function");
  });
});
